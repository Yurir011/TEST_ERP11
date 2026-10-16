"""입출금 조회: 목록 필터 쿼리, 미수금/미지급금 발생일, 월별 입금·출금 합계."""
from datetime import date

from sqlalchemy import extract, or_
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.models.client import Client
from app.models.payment import CardType, Payment, PaymentMethod, PaymentType
from app.models.transaction import Transaction


def occurred_dates(db: Session, payment_ids: list[int]) -> dict[int, date]:
    """입출금 id -> 그 입출금으로 결제완료된 매입매출의 거래일(미수금/미지급금 발생일)."""
    if not payment_ids:
        return {}
    rows = (
        db.query(Transaction.settled_payment_id, Transaction.transaction_date)
        .filter(Transaction.settled_payment_id.in_(payment_ids))
        .all()
    )
    return {pid: d for pid, d in rows}


def build_payment_query(
    db: Session,
    type_filter: PaymentType | None,
    year: int | None,
    month: int | None,
    date_from: date | None,
    date_to: date | None,
    q: str | None,
    card_pending: bool | None = None,
    method: PaymentMethod | None = None,
    card_type: CardType | None = None,
):
    query = db.query(Payment).options(joinedload(Payment.client), joinedload(Payment.creator))
    if type_filter is not None:
        query = query.filter(Payment.type == type_filter)
    if method is not None:
        query = query.filter(Payment.method == method)
    if card_type is not None:
        query = query.filter(Payment.card_type == card_type)
    if card_pending is not None:
        query = query.filter(Payment.card_pending.is_(card_pending))

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


def monthly_total(db: Session, payment_type: PaymentType, year: int, month: int) -> int:
    """한 달의 입금 또는 출금 합계. 카드 결제일 전(결제예정) 사용내역은 집계에서 제외한다."""
    value = (
        db.query(sa_func.coalesce(sa_func.sum(Payment.amount), 0))
        .filter(
            Payment.type == payment_type,
            Payment.card_pending.is_(False),  # 카드 결제일 전(결제예정) 사용내역은 집계에서 제외
            extract("year", Payment.payment_date) == year,
            extract("month", Payment.payment_date) == month,
        )
        .scalar()
    )
    return int(value)
