from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import extract, func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import require_menu_access
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.transaction import Transaction, TransactionType
from app.models.user import User, has_menu_permission
from app.schemas.transaction import (
    HometaxImportResult,
    HometaxPreviewOut,
    HometaxPreviewRow,
    TransactionCreate,
    TransactionOut,
    VatReportOut,
)
from app.services.hometax_apply import apply_plan, build_plan
from app.services.hometax_import import HometaxParseError, parse_hometax_excel
from app.services.transaction_list_excel import generate_transaction_list_excel

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
logger = get_logger("Transactions")
require_transactions_access = require_menu_access("transactions")


def _build_transaction_query(
    db: Session,
    type_filter: TransactionType | None,
    year: int | None,
    month: int | None,
    start_date: date | None,
    end_date: date | None,
):
    query = db.query(Transaction).options(joinedload(Transaction.client))
    if type_filter is not None:
        query = query.filter(Transaction.type == type_filter)
    if year is not None:
        query = query.filter(extract("year", Transaction.transaction_date) == year)
    if month is not None:
        query = query.filter(extract("month", Transaction.transaction_date) == month)
    if start_date is not None:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date is not None:
        query = query.filter(Transaction.transaction_date <= end_date)
    return query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc())


def _to_out(tx: Transaction) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        type=tx.type,
        transaction_date=tx.transaction_date,
        client_id=tx.client_id,
        client_name=tx.client.name if tx.client else None,
        counterparty=tx.counterparty,
        item_name=tx.item_name,
        supply_amount=tx.supply_amount,
        vat_amount=tx.vat_amount,
        total_amount=tx.total_amount,
        tax_invoice_no=tx.tax_invoice_no,
        memo=tx.memo,
        created_at=tx.created_at,
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    type_filter: TransactionType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_transactions_access),
):
    logger.debug(
        f"[Transactions] 목록 조회: type={type_filter}, year={year}, month={month}, "
        f"start_date={start_date}, end_date={end_date}, by={current_user.id}"
    )
    transactions = _build_transaction_query(db, type_filter, year, month, start_date, end_date).all()
    return [_to_out(t) for t in transactions]


@router.get("/export/excel")
def export_transactions_excel(
    type_filter: TransactionType | None = Query(default=None, alias="type"),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_transactions_access),
):
    transactions = _build_transaction_query(db, type_filter, year, month, start_date, end_date).all()
    logger.debug(
        f"[Transactions] 목록 엑셀 내보내기: count={len(transactions)}, start_date={start_date}, "
        f"end_date={end_date}, by={current_user.id}"
    )
    excel_bytes = generate_transaction_list_excel(transactions)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/report/vat", response_model=VatReportOut)
def get_vat_report(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_transactions_access),
):
    def sums(tx_type: TransactionType) -> tuple[int, int]:
        row = (
            db.query(sa_func.coalesce(sa_func.sum(Transaction.supply_amount), 0), sa_func.coalesce(sa_func.sum(Transaction.vat_amount), 0))
            .filter(
                Transaction.type == tx_type,
                extract("year", Transaction.transaction_date) == year,
                extract("month", Transaction.transaction_date) == month,
            )
            .first()
        )
        return int(row[0]), int(row[1])

    sales_supply, sales_vat = sums(TransactionType.sales)
    purchase_supply, purchase_vat = sums(TransactionType.purchase)

    logger.debug(f"[Transactions] 부가세 리포트: {year}-{month}, by={current_user.id}")
    return VatReportOut(
        year=year,
        month=month,
        sales_supply=sales_supply,
        sales_vat=sales_vat,
        purchase_supply=purchase_supply,
        purchase_vat=purchase_vat,
        payable_vat=sales_vat - purchase_vat,
    )


def _plan_from_upload(db: Session, file: UploadFile):
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="빈 파일입니다.")
    try:
        invoices = parse_hometax_excel(raw, file.filename or "")
    except HometaxParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return build_plan(db, invoices)


@router.post("/import-hometax/preview", response_model=HometaxPreviewOut)
def preview_hometax_import(
    file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)
):
    logger.debug(f"[Transactions] 홈택스 엑셀 미리보기: file={file.filename}, by={current_user.id}")
    plan = _plan_from_upload(db, file)
    rows = [
        HometaxPreviewRow(
            approval_no=p.approval_no,
            transaction_date=p.transaction_date,
            type=p.type,
            counterparty_name=p.counterparty_name,
            counterparty_reg_no=p.counterparty_reg_no,
            item_name=p.item_name,
            supply_amount=p.supply,
            vat_amount=p.vat,
            status=p.status,
            message=p.message,
            client_action=p.client_action,
        )
        for p in plan
    ]
    return HometaxPreviewOut(
        company_reg_no=settings.company_reg_no,
        total=len(rows),
        new_count=sum(1 for r in rows if r.status == "new"),
        duplicate_count=sum(1 for r in rows if r.status == "duplicate"),
        error_count=sum(1 for r in rows if r.status == "error"),
        new_client_count=len({p.counterparty_reg_no for p in plan if p.status == "new" and p.client_action in ("create", "create_same")}),
        rows=rows,
    )


@router.post("/import-hometax", response_model=HometaxImportResult)
def import_hometax(
    file: UploadFile = File(...),
    create_clients: bool = Query(default=True),
    create_documents: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_transactions_access),
):
    logger.debug(f"[Transactions] 홈택스 엑셀 적용: file={file.filename}, create_clients={create_clients}, by={current_user.id}")
    plan = _plan_from_upload(db, file)
    # 세금계산서 문서는 세금계산서 메뉴 권한이 있는 사용자만 만든다 (없으면 매입매출만 입력).
    make_documents = create_documents and has_menu_permission(current_user, "tax_invoice")
    return HometaxImportResult(
        **apply_plan(db, plan, current_user.id, create_clients=create_clients, create_documents=make_documents)
    )


@router.get("/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)):
    tx = db.query(Transaction).options(joinedload(Transaction.client)).filter(Transaction.id == tx_id).first()
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    return _to_out(tx)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)
):
    if payload.client_id is not None:
        client = db.query(Client).filter(Client.id == payload.client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    logger.debug(f"[Transactions] 등록: type={payload.type}, item={payload.item_name}, by={current_user.id}")
    tx = Transaction(
        type=payload.type,
        transaction_date=payload.transaction_date,
        client_id=payload.client_id,
        counterparty=payload.counterparty,
        item_name=payload.item_name,
        supply_amount=payload.supply_amount,
        vat_amount=payload.vat_amount,
        total_amount=payload.supply_amount + payload.vat_amount,
        tax_invoice_no=payload.tax_invoice_no,
        memo=payload.memo,
        created_by=current_user.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return _to_out(tx)


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_transactions_access),
):
    tx = db.query(Transaction).options(joinedload(Transaction.client)).filter(Transaction.id == tx_id).first()
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")

    if payload.client_id is not None:
        client = db.query(Client).filter(Client.id == payload.client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    tx.type = payload.type
    tx.transaction_date = payload.transaction_date
    tx.client_id = payload.client_id
    tx.counterparty = payload.counterparty
    tx.item_name = payload.item_name
    tx.supply_amount = payload.supply_amount
    tx.vat_amount = payload.vat_amount
    tx.total_amount = payload.supply_amount + payload.vat_amount
    tx.tax_invoice_no = payload.tax_invoice_no
    tx.memo = payload.memo
    db.commit()
    db.refresh(tx)
    logger.debug(f"[Transactions] 수정: id={tx_id}, by={current_user.id}")
    return _to_out(tx)


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    db.delete(tx)
    db.commit()
    logger.debug(f"[Transactions] 삭제: id={tx_id}, by={current_user.id}")
    return None
