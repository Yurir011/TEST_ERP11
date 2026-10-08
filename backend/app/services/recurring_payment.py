import calendar
from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client  # noqa: F401  (Payment 관계 매핑에 필요)
from app.models.payment import Payment, PaymentMethod
from app.models.recurring_payment import RecurringPayment, RecurringPaymentRun

logger = get_logger("RecurringPayments")

# 시작 월이 아주 오래전으로 잘못 입력돼도 한 번에 너무 많은 내역이 생기지 않도록 하는 안전장치(개월 수).
MAX_BACKFILL_MONTHS = 36


def _month_iter(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        m += 1
        if m > 12:
            y, m = y + 1, 1


def due_date(year: int, month: int, day_of_month: int) -> date:
    """해당 월의 자동이체일. 31일처럼 그 달에 없는 날짜는 말일로 맞춘다."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))


def generate_recurring_payments(db: Session, today: date | None = None) -> int:
    """활성화된 정기 자동이체 중 도래한 월분을 입출금 내역으로 기록한다. 이미 기록한 월분은 건너뛰므로 여러 번 불러도 안전하다."""
    today = today or date.today()
    created = 0
    templates = db.query(RecurringPayment).filter(RecurringPayment.is_active.is_(True)).all()

    for tpl in templates:
        done = {r.year_month for r in db.query(RecurringPaymentRun).filter(RecurringPaymentRun.recurring_id == tpl.id).all()}
        earliest = date(today.year, today.month, 1)
        for _ in range(MAX_BACKFILL_MONTHS - 1):
            earliest = date(earliest.year - 1, 12, 1) if earliest.month == 1 else date(earliest.year, earliest.month - 1, 1)
        start = max(tpl.start_month, earliest)

        for y, m in _month_iter(start, today):
            key = f"{y}-{m:02d}"
            if key in done:
                continue
            when = due_date(y, m, tpl.day_of_month)
            if when > today:
                continue

            memo = "정기 자동이체" + (f" · {tpl.memo}" if tpl.memo else "")
            payment = Payment(
                type=tpl.type,
                payment_date=when,
                category=tpl.category,
                description=tpl.description,
                amount=tpl.amount,
                method=PaymentMethod.bank_transfer,
                bank_type=tpl.bank_type,
                memo=memo,
                created_by=tpl.created_by,
            )
            db.add(payment)
            db.flush()
            db.add(RecurringPaymentRun(recurring_id=tpl.id, year_month=key, payment_id=payment.id))
            created += 1
            logger.debug(f"[RecurringPayments] 자동이체 기록: template_id={tpl.id}, {when}, amount={tpl.amount}")

    if created:
        try:
            db.commit()
        except IntegrityError:
            # 동시에 들어온 다른 요청이 같은 월분을 먼저 기록한 경우. 그쪽 결과를 그대로 쓰면 된다.
            db.rollback()
            logger.debug("[RecurringPayments] 동시 기록 감지, 이번 요청분은 건너뜀")
            return 0
    return created
