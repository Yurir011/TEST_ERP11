import os
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import extract, or_
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import require_menu_access

require_payments_access = require_menu_access("payments")
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.payment import Payment, PaymentMethod, PaymentType
from app.models.user import User
from app.schemas.payment import CsvImportResult, PaymentCreate, PaymentOut, PaymentReportOut
from app.services.payment_csv import CsvParseError, parse_card_statement_csv
from app.services.payment_list_excel import generate_payment_list_excel
from app.services.payment_voucher_excel import generate_payment_voucher_excel
from app.services.payment_voucher_pdf import generate_payment_voucher_pdf

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = get_logger("Payments")

ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _to_out(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        type=p.type,
        payment_date=p.payment_date,
        category=p.category,
        description=p.description,
        amount=p.amount,
        method=p.method,
        client_id=p.client_id,
        client_name=p.client.name if p.client else None,
        has_receipt=bool(p.receipt_path),
        memo=p.memo,
        proof_type=p.proof_type,
        proof_type_detail=p.proof_type_detail,
        card_type=p.card_type,
        bank_type=p.bank_type,
        created_at=p.created_at,
    )


def _build_payment_query(
    db: Session,
    type_filter: PaymentType | None,
    year: int | None,
    month: int | None,
    date_from: date | None,
    date_to: date | None,
    q: str | None,
):
    query = db.query(Payment).options(joinedload(Payment.client), joinedload(Payment.creator))
    if type_filter is not None:
        query = query.filter(Payment.type == type_filter)

    # 기간(date_from/date_to) 지정이 있으면 그걸 우선하고, 없을 때만 기존 연/월 필터를 적용한다.
    if date_from is not None or date_to is not None:
        if date_from is not None:
            query = query.filter(Payment.payment_date >= date_from)
        if date_to is not None:
            query = query.filter(Payment.payment_date <= date_to)
    else:
        if year is not None:
            query = query.filter(extract("year", Payment.payment_date) == year)
        if month is not None:
            query = query.filter(extract("month", Payment.payment_date) == month)

    if q:
        keyword = f"%{q}%"
        query = query.outerjoin(Client, Payment.client_id == Client.id).filter(
            or_(
                Payment.category.ilike(keyword),
                Payment.description.ilike(keyword),
                Payment.memo.ilike(keyword),
                Client.name.ilike(keyword),
            )
        )

    return query.order_by(Payment.payment_date.desc(), Payment.id.desc())


@router.get("", response_model=list[PaymentOut])
def list_payments(
    type_filter: PaymentType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None, description="분류/내용/메모/거래처명 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    payments = _build_payment_query(db, type_filter, year, month, date_from, date_to, q).all()
    return [_to_out(p) for p in payments]


@router.get("/export/excel")
def export_payments_excel(
    type_filter: PaymentType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None, description="분류/내용/메모/거래처명 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    payments = _build_payment_query(db, type_filter, year, month, date_from, date_to, q).all()
    logger.debug(
        f"[Payments] 목록 엑셀 내보내기: count={len(payments)}, date_from={date_from}, date_to={date_to}, "
        f"q={q}, by={current_user.id}"
    )
    excel_bytes = generate_payment_list_excel(payments)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/report/monthly", response_model=PaymentReportOut)
def get_monthly_report(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    def total(payment_type: PaymentType) -> int:
        value = (
            db.query(sa_func.coalesce(sa_func.sum(Payment.amount), 0))
            .filter(
                Payment.type == payment_type,
                extract("year", Payment.payment_date) == year,
                extract("month", Payment.payment_date) == month,
            )
            .scalar()
        )
        return int(value)

    deposit = total(PaymentType.deposit)
    withdrawal = total(PaymentType.withdrawal)
    return PaymentReportOut(year=year, month=month, total_deposit=deposit, total_withdrawal=withdrawal, net=deposit - withdrawal)


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    if payload.client_id is not None:
        client = db.query(Client).filter(Client.id == payload.client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    logger.debug(f"[Payments] 등록: type={payload.type}, amount={payload.amount}, by={current_user.id}")
    payment = Payment(
        type=payload.type,
        payment_date=payload.payment_date,
        category=payload.category,
        description=payload.description,
        amount=payload.amount,
        method=payload.method,
        client_id=payload.client_id,
        memo=payload.memo,
        proof_type=payload.proof_type,
        proof_type_detail=payload.proof_type_detail,
        card_type=payload.card_type,
        bank_type=payload.bank_type,
        created_by=current_user.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return _to_out(payment)


@router.post("/import-csv", response_model=CsvImportResult)
def import_card_statement(
    file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    raw = file.file.read()
    logger.debug(f"[Payments] CSV 업로드: filename={file.filename}, size={len(raw)}, by={current_user.id}")
    try:
        rows = parse_card_statement_csv(raw)
    except CsvParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    imported = 0
    errors: list[str] = []
    for i, row in enumerate(rows, start=1):
        try:
            payment = Payment(
                type=PaymentType.withdrawal,
                payment_date=row["payment_date"],
                category="법인카드",
                description=row["description"],
                amount=row["amount"],
                method=PaymentMethod.corporate_card,
                created_by=current_user.id,
            )
            db.add(payment)
            imported += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{i}행: {exc}")

    db.commit()
    logger.debug(f"[Payments] CSV 가져오기 완료: imported={imported}, errors={len(errors)}")
    return CsvImportResult(imported=imported, skipped=len(errors), errors=errors)


@router.post("/{payment_id}/receipt", response_model=PaymentOut)
def upload_receipt(
    payment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    payment = db.query(Payment).options(joinedload(Payment.client)).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")
    if file.content_type not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지 파일(jpg, png, webp)만 업로드할 수 있습니다.")

    os.makedirs(settings.receipts_dir, exist_ok=True)
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    file_path = os.path.join(settings.receipts_dir, f"{payment.id}.{ext}")
    with open(file_path, "wb") as f:
        f.write(file.file.read())

    payment.receipt_path = file_path
    db.commit()
    db.refresh(payment)
    logger.debug(f"[Payments] 영수증 업로드: payment_id={payment_id}, by={current_user.id}")
    return _to_out(payment)


@router.get("/{payment_id}/receipt")
def get_receipt(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None or not payment.receipt_path or not os.path.exists(payment.receipt_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 이미지를 찾을 수 없습니다.")
    return FileResponse(payment.receipt_path)


def _get_payment_with_voucher_relations(db: Session, payment_id: int) -> Payment:
    payment = (
        db.query(Payment)
        .options(joinedload(Payment.client), joinedload(Payment.creator))
        .filter(Payment.id == payment_id)
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")
    return payment


@router.get("/{payment_id}/pdf")
def get_payment_voucher_pdf(
    payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    payment = _get_payment_with_voucher_relations(db, payment_id)
    logger.debug(f"[Payments] 전표 PDF 생성: payment_id={payment_id}, by={current_user.id}")
    pdf_bytes = generate_payment_voucher_pdf(payment)
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/{payment_id}/excel")
def get_payment_voucher_excel(
    payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    payment = _get_payment_with_voucher_relations(db, payment_id)
    logger.debug(f"[Payments] 전표 엑셀 생성: payment_id={payment_id}, by={current_user.id}")
    excel_bytes = generate_payment_voucher_excel(payment)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.put("/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    payment = db.query(Payment).options(joinedload(Payment.client)).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")

    if payload.client_id is not None:
        client = db.query(Client).filter(Client.id == payload.client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    payment.type = payload.type
    payment.payment_date = payload.payment_date
    payment.category = payload.category
    payment.description = payload.description
    payment.amount = payload.amount
    payment.method = payload.method
    payment.client_id = payload.client_id
    payment.memo = payload.memo
    payment.proof_type = payload.proof_type
    payment.proof_type_detail = payload.proof_type_detail
    payment.card_type = payload.card_type
    payment.bank_type = payload.bank_type
    db.commit()
    db.refresh(payment)
    logger.debug(f"[Payments] 수정: id={payment_id}, by={current_user.id}")
    return _to_out(payment)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")
    db.delete(payment)
    db.commit()
    logger.debug(f"[Payments] 삭제: id={payment_id}, by={current_user.id}")
    return None
