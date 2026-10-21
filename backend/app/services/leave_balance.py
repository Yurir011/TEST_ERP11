"""연차 잔여 계산: 입사일 기준 근로기준법 자동 발생 + 관리자 조정 − 사용, 지난 주기에 당겨 쓴 일수는 이월해서 차감한다.

- 자동 발생: core/leave_calc.calculate_annual_leave_days (1년 미만 월 1일(최대 11일), 1년 이상 15일 + 2년마다 1일, 최대 25일)
- 연차 주기: 입사일 기준 1년 (core/leave_calc.get_leave_year_window)
- 마이너스(당겨 쓰기): 발생 일수보다 많이 쓰면 잔여가 음수가 되고, 부족분은 다음 주기 발생 연차에서 먼저 차감한다.
  당겨 쓸 수 있는 한도는 다음 주기에 발생할 연차 일수까지다.
"""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.leave_calc import _add_years, calculate_annual_leave_days, full_years_between, get_leave_year_window
from app.models.leave import LeaveAdjustment, LeaveRequest, LeaveStatus
from app.models.user import User
from app.schemas.leave import LeaveBalanceOut


def _sum_adjustments(db: Session, user_id: int, start: date, end: date) -> int:
    rows = (
        db.query(LeaveAdjustment.days)
        .filter(LeaveAdjustment.user_id == user_id, LeaveAdjustment.effective_date >= start, LeaveAdjustment.effective_date < end)
        .all()
    )
    return sum(r[0] for r in rows)


def _used_days(db: Session, user_id: int, start: date, end: date, status: LeaveStatus) -> int:
    rows = (
        db.query(LeaveRequest.days)
        .filter(LeaveRequest.user_id == user_id, LeaveRequest.start_date >= start, LeaveRequest.start_date < end, LeaveRequest.status == status)
        .all()
    )
    return sum(r[0] for r in rows)


def carried_deficit(db: Session, user: User, as_of: date) -> int:
    """지난 주기들에서 당겨 쓰고 갚지 못한 일수 (주기마다 승인된 사용 − 그 주기 전체 발생·조정분, 앞 주기의 부족분 포함)."""
    hire = user.hire_date
    if as_of < hire:
        return 0
    deficit = 0
    for k in range(full_years_between(hire, as_of)):
        start, end = _add_years(hire, k), _add_years(hire, k + 1)
        full_grant = calculate_annual_leave_days(hire, end - timedelta(days=1))  # 그 주기가 끝날 때의 발생 일수
        available = full_grant + _sum_adjustments(db, user.id, start, end)
        deficit = max(0, _used_days(db, user.id, start, end, LeaveStatus.approved) + deficit - available)
    return deficit


def compute_balance(db: Session, user: User, as_of: date) -> LeaveBalanceOut:
    hire = user.hire_date
    auto = calculate_annual_leave_days(hire, as_of)
    period_start, period_end = get_leave_year_window(hire, as_of)
    adjustment = _sum_adjustments(db, user.id, period_start, period_end)
    deficit = carried_deficit(db, user, as_of)
    used = _used_days(db, user.id, period_start, period_end, LeaveStatus.approved)
    pending = _used_days(db, user.id, period_start, period_end, LeaveStatus.pending)
    granted = auto + adjustment
    return LeaveBalanceOut(
        granted=granted,
        auto_granted=auto,
        adjustment=adjustment,
        carried_deficit=deficit,
        used=used,
        pending=pending,
        remaining=granted - used - deficit,
        advance_limit=calculate_annual_leave_days(hire, period_end),
        hire_date=hire,
        period_start=period_start,
        period_end=period_end,
    )
