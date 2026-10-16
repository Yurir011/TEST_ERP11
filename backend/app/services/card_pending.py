"""법인카드 결제예정(card_pending) 처리: 등록·수정 시 상태 결정, 카드별 요약, 결제일 일괄 확정, 카드 명세서 가져오기.

법인카드 출금은 카드 결제일에 일괄 확정할 때까지 결제예정으로 두고, 월별 집계에서 뺀다.
결제일·사용기간 계산은 `card_billing`이 맡는다. 이 모듈은 commit 하지 않는다 (호출한 라우터가 commit).
"""
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.payment import CardType, Payment, PaymentMethod, PaymentType
from app.models.transaction import Transaction
from app.services import card_billing

logger = get_logger("CardPending")


def starts_pending(payment_type: PaymentType, method: PaymentMethod, linked_tx: Transaction | None) -> bool:
    """새 입출금이 결제예정으로 시작하는지. 법인카드 출금만 해당하고, 외상 매입매출 결제 건은 즉시 확정한다."""
    return payment_type == PaymentType.withdrawal and method == PaymentMethod.corporate_card and linked_tx is None


def update_pending_on_edit(payment: Payment, new_type: PaymentType, new_method: PaymentMethod, new_date: date) -> None:
    """아직 결제 전인 카드 사용내역을 수정할 때: 카드 출금으로 남아 있으면 사용일만 갱신하고, 다른 결제수단으로 바꾸면 결제예정을 푼다.
    결제예정이 아닌 내역은 바꾸지 않는다."""
    if not payment.card_pending:
        return
    if new_type == PaymentType.withdrawal and new_method == PaymentMethod.corporate_card:
        payment.card_used_date = new_date
    else:
        payment.card_pending = False
        payment.card_used_date = None


@dataclass
class CardPendingSummary:
    card_type: CardType
    count: int
    total_amount: int
    oldest_used_date: date | None
    newest_used_date: date | None
    default_settle_date: date
    usage_from: date
    usage_to: date
    later_count: int
    later_amount: int


def summarize(db: Session, card_type: CardType, today: date) -> CardPendingSummary:
    """카드 한 종류의 결제예정 요약. 다음 결제일에 청구되는 건만 건수/금액에 넣고, 그 뒤 사용분은 later_* 로 따로 센다."""
    base = db.query(Payment).filter(Payment.card_pending.is_(True), Payment.card_type == card_type)
    oldest = base.with_entities(sa_func.min(Payment.payment_date)).scalar()
    settle_date = card_billing.default_settle_date(card_type, oldest, today)
    usage_from, usage_to = card_billing.usage_month_of(settle_date)

    def agg(*conds):
        count, total = base.filter(*conds).with_entities(sa_func.count(Payment.id), sa_func.coalesce(sa_func.sum(Payment.amount), 0)).one()
        return int(count), int(total)

    count, total = agg(Payment.payment_date <= usage_to)
    later_count, later_amount = agg(Payment.payment_date > usage_to)
    return CardPendingSummary(
        card_type=card_type,
        count=count,
        total_amount=total,
        oldest_used_date=oldest,
        newest_used_date=base.filter(Payment.payment_date <= usage_to).with_entities(sa_func.max(Payment.payment_date)).scalar(),
        default_settle_date=settle_date,
        usage_from=usage_from,
        usage_to=usage_to,
        later_count=later_count,
        later_amount=later_amount,
    )


def settle(db: Session, card_type: CardType, settle_date: date) -> tuple[int, int, date]:
    """결제일에 그 결제일이 청구하는 사용기간(전월 1일~말일) 이전의 결제예정 건을 출금 확정한다.
    입출금 날짜는 결제일로 바뀌고 원래 날짜는 사용일로 남는다. (건수, 합계, 사용기간 끝)을 돌려준다."""
    _, usage_to = card_billing.usage_month_of(settle_date)
    pending = (
        db.query(Payment)
        .filter(Payment.card_pending.is_(True), Payment.card_type == card_type, Payment.payment_date <= usage_to)
        .all()
    )
    total = 0
    for p in pending:
        p.card_used_date = p.card_used_date or p.payment_date
        p.payment_date = settle_date
        p.card_pending = False
        total += p.amount
    return len(pending), total, usage_to


def add_statement_rows(db: Session, rows: list[dict], card_type: CardType, created_by: int) -> tuple[int, list[str]]:
    """카드 명세서에서 읽은 행을 결제예정 출금으로 추가한다. (추가 건수, 행별 오류)를 돌려준다."""
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
                card_type=card_type,
                card_pending=True,
                card_used_date=row["payment_date"],
                created_by=created_by,
            )
            db.add(payment)
            imported += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{i}행: {exc}")
    return imported, errors
