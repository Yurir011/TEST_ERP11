from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.attendance import Attendance
from app.models.user import User
from app.schemas.attendance import AttendanceOut

router = APIRouter(prefix="/api/attendance", tags=["attendance"])
logger = get_logger("Attendance")

MAX_HISTORY_MONTHS = 36  # 개인 근태 조회는 최근 36개월(현재월 포함)까지만 허용


def _assert_within_history_window(year: int, month: int) -> None:
    today = date.today()
    months_diff = (today.year - year) * 12 + (today.month - month)
    if months_diff < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="미래 월은 조회할 수 없습니다.")
    if months_diff >= MAX_HISTORY_MONTHS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"최근 {MAX_HISTORY_MONTHS}개월까지만 조회할 수 있습니다.",
        )


def _to_out(record: Attendance) -> AttendanceOut:
    return AttendanceOut(
        id=record.id,
        user_id=record.user_id,
        user_name=record.user.name,
        work_date=record.work_date,
        clock_in=record.clock_in,
        clock_out=record.clock_out,
    )


def _month_query(db: Session, year: int, month: int):
    return (
        db.query(Attendance)
        .options(joinedload(Attendance.user))
        .filter(extract("year", Attendance.work_date) == year)
        .filter(extract("month", Attendance.work_date) == month)
    )


@router.post("/clock-in", response_model=AttendanceOut)
def clock_in(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    logger.debug(f"[Attendance] 출근 기록 시도: user_id={current_user.id}, date={today}")

    record = db.query(Attendance).filter(Attendance.user_id == current_user.id, Attendance.work_date == today).first()
    if record and record.clock_in is not None:
        logger.debug(f"[Attendance] 이미 출근 처리됨: user_id={current_user.id}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="오늘 이미 출근 처리되었습니다.")

    now = datetime.now(timezone.utc)
    if record is None:
        record = Attendance(user_id=current_user.id, work_date=today, clock_in=now)
        db.add(record)
    else:
        record.clock_in = now

    db.commit()
    db.refresh(record)
    record.user = current_user
    logger.debug(f"[Attendance] 출근 기록 완료: user_id={current_user.id}, time={now.isoformat()}")
    return _to_out(record)


@router.post("/clock-out", response_model=AttendanceOut)
def clock_out(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    logger.debug(f"[Attendance] 퇴근 기록 시도: user_id={current_user.id}, date={today}")

    record = db.query(Attendance).filter(Attendance.user_id == current_user.id, Attendance.work_date == today).first()
    if record is None or record.clock_in is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="출근 기록이 없습니다. 먼저 출근해주세요.")
    if record.clock_out is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="오늘 이미 퇴근 처리되었습니다.")

    record.clock_out = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    logger.debug(f"[Attendance] 퇴근 기록 완료: user_id={current_user.id}")
    return _to_out(record)


@router.get("/today", response_model=AttendanceOut | None)
def get_today(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    record = (
        db.query(Attendance)
        .options(joinedload(Attendance.user))
        .filter(Attendance.user_id == current_user.id, Attendance.work_date == today)
        .first()
    )
    return _to_out(record) if record else None


@router.get("/me", response_model=list[AttendanceOut])
def get_my_attendance(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Attendance] 내 근태 조회: user_id={current_user.id}, {year}-{month}")
    _assert_within_history_window(year, month)
    records = (
        _month_query(db, year, month)
        .filter(Attendance.user_id == current_user.id)
        .order_by(Attendance.work_date.desc())
        .all()
    )
    return [_to_out(r) for r in records]


@router.get("", response_model=list[AttendanceOut])
def get_all_attendance(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month),
    user_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    logger.debug(f"[Attendance] 전체 근태 조회(관리자): by={current_user.id}, {year}-{month}, user_id={user_id}")
    query = _month_query(db, year, month)
    if user_id is not None:
        query = query.filter(Attendance.user_id == user_id)
    records = query.order_by(Attendance.work_date.desc(), Attendance.user_id).all()
    return [_to_out(r) for r in records]
