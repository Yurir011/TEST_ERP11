from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.core.leave_calc import calculate_annual_leave_days, count_business_days, get_leave_year_window
from app.database import get_db
from app.logging_config import get_logger
from app.models.leave import LeaveRequest, LeaveStatus
from app.models.notice import Notice
from app.models.user import User
from app.schemas.leave import LeaveBalanceOut, LeaveCreate, LeaveOut

router = APIRouter(prefix="/api/leaves", tags=["leaves"])
logger = get_logger("Leaves")


def _to_out(record: LeaveRequest) -> LeaveOut:
    return LeaveOut(
        id=record.id,
        user_id=record.user_id,
        user_name=record.user.name,
        start_date=record.start_date,
        end_date=record.end_date,
        days=record.days,
        reason=record.reason,
        status=record.status,
        reviewed_by_name=record.reviewer.name if record.reviewer else None,
        reviewed_at=record.reviewed_at,
        created_at=record.created_at,
    )


def _compute_balance(db: Session, user: User, as_of: date) -> LeaveBalanceOut:
    granted = calculate_annual_leave_days(user.hire_date, as_of)
    period_start, period_end = get_leave_year_window(user.hire_date, as_of)

    records = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.user_id == user.id,
            LeaveRequest.start_date >= period_start,
            LeaveRequest.start_date < period_end,
            LeaveRequest.status != LeaveStatus.rejected,
        )
        .all()
    )
    used = sum(r.days for r in records if r.status == LeaveStatus.approved)
    pending = sum(r.days for r in records if r.status == LeaveStatus.pending)

    return LeaveBalanceOut(
        granted=granted,
        used=used,
        pending=pending,
        remaining=granted - used,
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/balance", response_model=LeaveBalanceOut)
def get_my_balance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _compute_balance(db, current_user, date.today())


@router.post("", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
def create_leave(
    payload: LeaveCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    logger.debug(f"[Leaves] 신청 시도: user_id={current_user.id}, {payload.start_date}~{payload.end_date}")

    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료일은 시작일보다 빠를 수 없습니다.")

    days = count_business_days(payload.start_date, payload.end_date)
    if days <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="평일이 포함된 기간을 선택해주세요.")

    balance = _compute_balance(db, current_user, payload.start_date)
    if days > balance.remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"잔여 연차({balance.remaining}일)보다 많은 {days}일을 신청할 수 없습니다.",
        )

    record = LeaveRequest(
        user_id=current_user.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days=days,
        reason=payload.reason,
        status=LeaveStatus.pending,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    record.user = current_user
    logger.debug(f"[Leaves] 신청 완료: id={record.id}, days={days}")
    return _to_out(record)


@router.get("/me", response_model=list[LeaveOut])
def get_my_leaves(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.user), joinedload(LeaveRequest.reviewer))
        .filter(LeaveRequest.user_id == current_user.id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )
    return [_to_out(r) for r in records]


@router.get("", response_model=list[LeaveOut])
def get_all_leaves(
    status_filter: LeaveStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    logger.debug(f"[Leaves] 전체 조회(관리자): by={current_user.id}, status={status_filter}")
    query = db.query(LeaveRequest).options(joinedload(LeaveRequest.user), joinedload(LeaveRequest.reviewer))
    if status_filter is not None:
        query = query.filter(LeaveRequest.status == status_filter)
    records = query.order_by(LeaveRequest.created_at.desc()).all()
    return [_to_out(r) for r in records]


@router.get("/team-calendar", response_model=list[LeaveOut])
def get_team_calendar(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    month_start = date(year, month, 1)
    month_end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    records = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.user), joinedload(LeaveRequest.reviewer))
        .filter(
            LeaveRequest.status == LeaveStatus.approved,
            LeaveRequest.start_date < month_end,
            LeaveRequest.end_date >= month_start,
        )
        .order_by(LeaveRequest.start_date)
        .all()
    )
    return [_to_out(r) for r in records]


def _get_owned_leave(db: Session, leave_id: int, current_user: User) -> LeaveRequest:
    record = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.user))
        .filter(LeaveRequest.id == leave_id, LeaveRequest.user_id == current_user.id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연차 신청 내역을 찾을 수 없습니다.")
    return record


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_leave(leave_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    record = _get_owned_leave(db, leave_id, current_user)
    if record.status != LeaveStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인 대기 중인 신청만 취소할 수 있습니다.")
    db.delete(record)
    db.commit()
    logger.debug(f"[Leaves] 취소 완료: id={leave_id}, user_id={current_user.id}")
    return None


@router.put("/{leave_id}/approve", response_model=LeaveOut)
def approve_leave(leave_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    record = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.user))
        .filter(LeaveRequest.id == leave_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연차 신청 내역을 찾을 수 없습니다.")
    if record.status != LeaveStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 처리된 신청입니다.")

    record.status = LeaveStatus.approved
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now(timezone.utc)

    notice = Notice(
        title=f"[연차] {record.user.name}님 연차 승인 안내",
        content=(
            f"{record.user.name}님의 연차 사용이 승인되었습니다.\n"
            f"기간: {record.start_date} ~ {record.end_date} ({record.days}일)"
        ),
        author_id=current_user.id,
    )
    db.add(notice)

    db.commit()
    db.refresh(record)
    record.reviewer = current_user
    logger.debug(f"[Leaves] 승인: id={leave_id}, by={current_user.id}, 공지 등록: {notice.title}")
    return _to_out(record)


@router.put("/{leave_id}/reject", response_model=LeaveOut)
def reject_leave(leave_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    record = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.user))
        .filter(LeaveRequest.id == leave_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연차 신청 내역을 찾을 수 없습니다.")
    if record.status != LeaveStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 처리된 신청입니다.")

    record.status = LeaveStatus.rejected
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    record.reviewer = current_user
    logger.debug(f"[Leaves] 반려: id={leave_id}, by={current_user.id}")
    return _to_out(record)
