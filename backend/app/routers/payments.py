import os
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import extract, func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.payment import Payment, PaymentMethod, PaymentType
from app.models.user import User
from app.schemas.payment import CsvImportResult, PaymentCreate, PaymentOut, PaymentReportOut
from app.services.payment_csv import CsvParseError, parse_card_statement_csv

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
        created_at=p.created_at,
    )


@router.get("", response_model=list[PaymentOut])
def list_payments(
    type_filter: PaymentType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(Payment).options(joinedload(Payment.client))
    if type_filter is not None:
        query = query.filter(Payment.type == type_filter)
    if year is not None:
        query = query.filter(extract("year", Payment.payment_date) == year)
    if month is not None:
        query = query.filter(extract("month", Payment.payment_date) == month)
    payments = query.order_by(Payment.payment_date.desc(), Payment.id.desc()).all()
    return [_to_out(p) for p in payments]


@router.get("/report/monthly", response_model=PaymentReportOut)
def get_monthly_report(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
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
    payload: PaymentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)
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
        created_by=current_user.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return _to_out(payment)


@router.post("/import-csv", response_model=CsvImportResult)
def import_card_statement(
    file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(require_admin)
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
    current_user: User = Depends(require_admin),
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
def get_receipt(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None or not payment.receipt_path or not os.path.exists(payment.receipt_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="영수증 이미지를 찾을 수 없습니다.")
    return FileResponse(payment.receipt_path)


@router.put("/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
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
    db.commit()
    db.refresh(payment)
    logger.debug(f"[Payments] 수정: id={payment_id}, by={current_user.id}")
    return _to_out(payment)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")
    db.delete(payment)
    db.commit()
    logger.debug(f"[Payments] 삭제: id={payment_id}, by={current_user.id}")
    return None
