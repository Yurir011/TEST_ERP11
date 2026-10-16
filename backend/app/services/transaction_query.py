"""매입매출 조회: 목록 필터 쿼리, 월별 공급가액·부가세 합계(부가세 리포트)."""
from datetime import date

from sqlalchemy import extract, func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.models.transaction import Transaction, TransactionType


def build_transaction_query(
    db: Session,
    type_filter: TransactionType | None,
    year: int | None,
    month: int | None,
    start_date: date | None,
    end_date: date | None,
    settled: bool | None = None,
):
    query = db.query(Transaction).options(joinedload(Transaction.client))
    if settled is not None:
        query = query.filter(Transaction.settled.is_(settled))
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


def monthly_sums(db: Session, tx_type: TransactionType, year: int, month: int) -> tuple[int, int]:
    """한 달의 매출 또는 매입 (공급가액 합계, 부가세 합계). 결제 여부와 무관하게 거래일 기준으로 집계한다."""
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
