"""법인카드 결제일 계산. 사용기간은 매월 1일~말일이고, 그 다음 달 결제일에 청구된다.
결제일이 주말/공휴일이면 다음 영업일에 이체된다 (결제일이 일요일이면 월요일, 월요일이 공휴일이면 화요일 ...)."""
import calendar
from datetime import date, timedelta

import holidays

from app.logging_config import get_logger

logger = get_logger("CardBilling")


def next_business_day_on_or_after(d: date) -> date:
    kr_holidays = holidays.country_holidays("KR", years=[d.year, d.year + 1])
    while d.weekday() >= 5 or d in kr_holidays:
        d += timedelta(days=1)
    return d


def settle_date_for_month(pay_day: int, year: int, month: int) -> date:
    """year-month의 결제일(휴일이면 다음 영업일로 보정). pay_day 는 그 카드의 매월 결제일."""
    day = min(pay_day, calendar.monthrange(year, month)[1])
    return next_business_day_on_or_after(date(year, month, day))


def _month_add(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def usage_month_of(settle_date: date) -> tuple[date, date]:
    """결제일 하나가 청구하는 사용기간(전월 1일 ~ 전월 말일)."""
    y, m = _month_add(settle_date.year, settle_date.month, -1)
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def default_settle_date(pay_day: int, oldest_pending_used: date | None, today: date) -> date:
    """다음에 처리할 결제일. 결제예정 사용내역이 있으면 가장 오래된 사용월이 청구되는 결제일(이미 지났어도 그 날짜),
    없으면 오늘 이후 가장 가까운 결제일을 돌려준다."""
    if oldest_pending_used is not None:
        y, m = _month_add(oldest_pending_used.year, oldest_pending_used.month, 1)
        return settle_date_for_month(pay_day, y, m)
    this_month = settle_date_for_month(pay_day, today.year, today.month)
    if this_month >= today:
        return this_month
    y, m = _month_add(today.year, today.month, 1)
    return settle_date_for_month(pay_day, y, m)
