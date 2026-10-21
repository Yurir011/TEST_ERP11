import os
from dataclasses import asdict
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import require_menu_access

require_payments_access = require_menu_access("payments")
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.payment import Payment, PaymentMethod, PaymentType
from app.models.transaction import Transaction, TransactionType
from app.services.settlement import (
    apply_balance_settlement,
    apply_transaction_payment,
    ensure_within_balance,
    is_partial_payment,
    resettle_on_update,
    settlement_field,
    undo_payment_effects,
)
from app.services.transaction_credit import remaining_amount
from app.models.user import User
from app.services import card_pending as card_pending_service
from app.services.payment_accounts import list_accounts, require_account
from app.services.payment_query import build_payment_query, monthly_total, occurred_dates
from app.services.recurring_payment import generate_recurring_payments
from app.schemas.payment import (
    CardPendingSummaryOut,
    CardSettleIn,
    CardSettleOut,
    CsvImportResult,
    PaymentCreate,
    PaymentOut,
    PaymentReportOut,
    PaymentTransactionCandidateOut,
)
from app.services.payment_csv import CsvParseError, parse_card_statement_csv
from app.services.payment_list_excel import generate_payment_list_excel
from app.services.payment_voucher_excel import generate_payment_voucher_excel
from app.services.payment_voucher_pdf import generate_payment_voucher_pdf
from app.services.upload_check import IMAGE_TYPES, read_upload

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = get_logger("Payments")

ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/png", "image/webp"}

def _to_out(p: Payment, occurred_date: date | None = None) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        type=p.type,
        payment_date=p.payment_date,
        category=p.category,
        description=p.description,
        amount=p.amount,
        method=p.method,
        client_id=p.client_id,
        client_name=p.client.name if p.client else p.counterparty,
        has_receipt=bool(p.receipt_path),
        memo=p.memo,
        proof_type=p.proof_type,
        proof_type_detail=p.proof_type_detail,
        card_type=p.card_type,
        bank_type=p.bank_type,
        card_pending=bool(p.card_pending),
        card_used_date=p.card_used_date,
        occurred_date=occurred_date,
        created_at=p.created_at,
    )


@router.get("", response_model=list[PaymentOut])
def list_payments(
    type_filter: PaymentType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None, description="분류/내용/메모/거래처명 검색어"),
    card_pending: bool | None = Query(default=None, description="true이면 카드 결제일 전(결제예정) 사용내역만"),
    method: PaymentMethod | None = Query(default=None, description="결제수단 필터 (corporate_card = 카드 탭)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    generate_recurring_payments(db)  # 도래한 정기 자동이체를 먼저 기록한다
    payments = build_payment_query(db, type_filter, year, month, date_from, date_to, q, card_pending, method).all()
    occurred = occurred_dates(db, [p.id for p in payments])
    return [_to_out(p, occurred.get(p.id)) for p in payments]


@router.get("/export/excel")
def export_payments_excel(
    type_filter: PaymentType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None, description="분류/내용/메모/거래처명 검색어"),
    method: PaymentMethod | None = Query(default=None, description="결제수단 필터 (corporate_card = 카드 탭)"),
    card_type: str | None = Query(default=None, description="카드 필터 (카드 탭에서 카드 선택, 카드·계좌 관리의 code)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    generate_recurring_payments(db)
    payments = build_payment_query(db, type_filter, year, month, date_from, date_to, q, method=method, card_type=card_type).all()
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
    generate_recurring_payments(db)
    deposit = monthly_total(db, PaymentType.deposit, year, month)
    withdrawal = monthly_total(db, PaymentType.withdrawal, year, month)
    return PaymentReportOut(year=year, month=month, total_deposit=deposit, total_withdrawal=withdrawal, net=deposit - withdrawal)


@router.get("/card-pending", response_model=list[CardPendingSummaryOut])
def get_card_pending_summary(db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    """카드 결제일에 일괄 확정하기 전인 법인카드 사용내역을 카드별로 요약한다. 다음 결제일에 청구되는 건만 건수/금액에 포함한다."""
    today = date.today()
    result = [CardPendingSummaryOut(**asdict(card_pending_service.summarize(db, card.code, today))) for card in list_accounts(db, "card")]
    logger.debug(f"[Payments] 카드 결제예정 요약 조회: by={current_user.id}, {[(r.card_type, r.default_settle_date.isoformat(), r.count, r.total_amount) for r in result]}")
    return result


@router.post("/card-settle", response_model=CardSettleOut)
def settle_card_payments(
    payload: CardSettleIn, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    """카드 결제일에 해당 카드의 결제예정 사용내역 중 그 결제일이 청구하는 사용기간(전월 1일~말일) 이전 건을 한 번에 출금 확정한다.
    입출금 날짜는 결제일로 바뀐다."""
    require_account(db, "card", payload.card_type, must_be_active=False)
    count, total, usage_to = card_pending_service.settle(db, payload.card_type, payload.settle_date)
    db.commit()
    logger.debug(
        f"[Payments] 카드 결제일 일괄처리: card={payload.card_type}, settle_date={payload.settle_date}, usage_to={usage_to}, "
        f"count={count}, total={total}, by={current_user.id}"
    )
    return CardSettleOut(settled_count=count, total_amount=total)


@router.get("/linkable-transactions", response_model=list[PaymentTransactionCandidateOut])
def list_linkable_transactions(
    q: str | None = Query(default=None), db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    """매입매출관리에서 아직 결제완료되지 않은 외상 매출/매입 목록. 새 입출금 등록 화면의 "매입매출 불러오기"에서 쓴다."""
    query = db.query(Transaction).options(joinedload(Transaction.client)).filter(Transaction.settled.is_(False))
    if q:
        like = f"%{q.strip()}%"
        query = query.outerjoin(Client, Transaction.client_id == Client.id).filter(
            or_(Client.name.ilike(like), Transaction.counterparty.ilike(like), Transaction.item_name.ilike(like))
        )
    txs = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(200).all()
    logger.debug(f"[Payments] 불러올 외상 매입매출 {len(txs)}건 조회: q={q!r}, by={current_user.id}")
    return [
        PaymentTransactionCandidateOut(
            id=t.id,
            transaction_date=t.transaction_date,
            type=PaymentType.deposit if t.type == TransactionType.sales else PaymentType.withdrawal,
            client_id=t.client_id,
            client_name=(t.client.name if t.client else t.counterparty) or "-",
            item_name=t.item_name,
            total_amount=remaining_amount(t),  # 부분 결제된 건은 아직 받지(주지) 못한 금액
            tax_invoice_no=t.tax_invoice_no,
        )
        for t in txs
    ]


def _free_party(payload: PaymentCreate) -> str | None:
    """등록된 거래처를 고르지 않고 이름만 직접 입력한 경우의 이름 (거래처를 골랐으면 비운다)."""
    if payload.client_id is not None:
        return None
    return (payload.counterparty or "").strip()[:200] or None


def _check_method_accounts(db: Session, payload: PaymentCreate) -> None:
    """고른 법인카드·계좌가 카드·계좌 관리에 등록된 것인지 확인한다."""
    if payload.card_type is not None:
        require_account(db, "card", payload.card_type)
    if payload.bank_type is not None:
        require_account(db, "bank", payload.bank_type)


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    client = None
    if payload.client_id is not None:
        client = db.query(Client).filter(Client.id == payload.client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    _check_method_accounts(db, payload)

    linked_tx = None
    if payload.transaction_id is not None:
        linked_tx = db.query(Transaction).filter(Transaction.id == payload.transaction_id).first()
        if linked_tx is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="불러온 매입매출 내역을 찾을 수 없습니다.")
        if linked_tx.settled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 결제완료된 매입매출 내역입니다.")

    logger.debug(f"[Payments] 등록: type={payload.type}, amount={payload.amount}, tx={payload.transaction_id}, by={current_user.id}")

    # 연결한 매입매출의 미결제 금액보다 적게 수금/지급하면 전액 결제가 아니라 부분 결제로 기록한다.
    is_partial = is_partial_payment(linked_tx, payload.amount)

    # 매입매출 내역을 불러온 결제는 그 내역의 결제 처리에서 거래처 잔액을 줄이므로, 분류 기반 자동 정산은 건너뛴다.
    balance_field = None if linked_tx is not None else settlement_field(payload.type, payload.category)
    if client is not None and balance_field is not None:
        ensure_within_balance(client, balance_field, payload.amount)
        apply_balance_settlement(client, balance_field, payload.amount)

    # 법인카드 출금은 카드 결제일에 일괄 확정할 때까지 결제예정으로 둔다 (외상 매입매출 결제 건은 즉시 확정).
    is_card_pending = card_pending_service.starts_pending(payload.type, payload.method, linked_tx)
    payment = Payment(
        type=payload.type,
        payment_date=payload.payment_date,
        category=payload.category,
        description=payload.description,
        amount=payload.amount,
        method=payload.method,
        client_id=payload.client_id,
        counterparty=_free_party(payload),
        memo=payload.memo,
        proof_type=payload.proof_type,
        proof_type_detail=payload.proof_type_detail,
        card_type=payload.card_type,
        bank_type=payload.bank_type,
        card_pending=is_card_pending,
        card_used_date=payload.payment_date if is_card_pending else None,
        partial_transaction_id=linked_tx.id if is_partial else None,
        created_by=current_user.id,
    )
    db.add(payment)
    if linked_tx is not None:
        apply_transaction_payment(db, payment, linked_tx, partial=is_partial)
    db.commit()
    db.refresh(payment)
    return _to_out(payment, linked_tx.transaction_date if linked_tx is not None else None)


@router.post("/import-csv", response_model=CsvImportResult)
def import_card_statement(
    card_type: str = Query(description="가져오는 명세서의 카드(카드·계좌 관리의 code). 결제예정으로 기록되어 카드 결제일에 일괄 확정된다."),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    require_account(db, "card", card_type)
    raw = file.file.read()
    logger.debug(f"[Payments] CSV 업로드: filename={file.filename}, card_type={card_type}, size={len(raw)}, by={current_user.id}")
    try:
        rows = parse_card_statement_csv(raw)
    except CsvParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    imported, errors = card_pending_service.add_statement_rows(db, rows, card_type, current_user.id)
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

    content = read_upload(file, IMAGE_TYPES)
    os.makedirs(settings.receipts_dir, exist_ok=True)
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file.content_type]
    file_path = os.path.join(settings.receipts_dir, f"{payment.id}.{ext}")
    with open(file_path, "wb") as f:
        f.write(content)

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


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    payment = db.query(Payment).options(joinedload(Payment.client)).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")
    logger.debug(f"[Payments] 단건 조회: id={payment_id}, by={current_user.id}")
    return _to_out(payment)


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

    if payload.card_type is not None and payload.card_type != payment.card_type:
        require_account(db, "card", payload.card_type)
    if payload.bank_type is not None and payload.bank_type != payment.bank_type:
        require_account(db, "bank", payload.bank_type)

    linked_tx = db.query(Transaction).filter(Transaction.settled_payment_id == payment.id).first()
    if payment.partial_transaction_id is not None and payload.amount != payment.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="매입매출의 일부로 수금/지급한 내역은 금액을 수정할 수 없습니다. 삭제한 뒤 다시 등록해주세요.",
        )

    resettle_on_update(
        db,
        payment,
        linked_tx,
        new_type=payload.type,
        new_category=payload.category,
        new_client_id=payload.client_id,
        new_amount=payload.amount,
    )
    if linked_tx is not None:
        linked_tx.settled_date = payload.payment_date

    payment.type = payload.type
    payment.payment_date = payload.payment_date
    payment.category = payload.category
    payment.description = payload.description
    payment.amount = payload.amount
    payment.method = payload.method
    payment.client_id = payload.client_id
    payment.counterparty = _free_party(payload)
    payment.memo = payload.memo
    payment.proof_type = payload.proof_type
    payment.proof_type_detail = payload.proof_type_detail
    payment.card_type = payload.card_type
    payment.bank_type = payload.bank_type
    card_pending_service.update_pending_on_edit(payment, payload.type, payload.method, payload.payment_date)
    db.commit()
    db.refresh(payment)
    logger.debug(f"[Payments] 수정: id={payment_id}, by={current_user.id}")
    return _to_out(payment)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    payment = db.query(Payment).options(joinedload(Payment.client)).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출금 내역을 찾을 수 없습니다.")

    undo_payment_effects(db, payment)

    db.delete(payment)
    db.commit()
    logger.debug(f"[Payments] 삭제: id={payment_id}, by={current_user.id}")
    return None
