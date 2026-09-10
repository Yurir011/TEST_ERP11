from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract, func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionOut, VatReportOut

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
logger = get_logger("Transactions")


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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(Transaction).options(joinedload(Transaction.client))
    if type_filter is not None:
        query = query.filter(Transaction.type == type_filter)
    if year is not None:
        query = query.filter(extract("year", Transaction.transaction_date) == year)
    if month is not None:
        query = query.filter(extract("month", Transaction.transaction_date) == month)
    transactions = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()
    return [_to_out(t) for t in transactions]


@router.get("/report/vat", response_model=VatReportOut)
def get_vat_report(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
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


@router.get("/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tx = db.query(Transaction).options(joinedload(Transaction.client)).filter(Transaction.id == tx_id).first()
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    return _to_out(tx)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)
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
    current_user: User = Depends(require_admin),
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
def delete_transaction(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    db.delete(tx)
    db.commit()
    logger.debug(f"[Transactions] 삭제: id={tx_id}, by={current_user.id}")
    return None
