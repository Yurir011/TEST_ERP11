"""직원 상태(출근·외근·출장·휴가 등) 계산과 저장.

화면에 보이는 상태는 다음 순서로 정한다 (앞의 것이 우선).
  1. 오늘 직접 고른 상태, 또는 출근·퇴근 토글로 자동 설정된 상태 (user_presence, status_date 가 오늘인 것만)
  2. 오늘이 승인된 연차 기간이면 '휴가' (출근 전이라도 자동)
  3. 오늘 출퇴근 기록: 퇴근했으면 '퇴근', 출근만 했으면 '출근'
  4. 그 밖에는 '미출근'
직접 고른 상태는 날짜가 지나면 저절로 무시되므로 다음 날 아침에는 위 2~4 로 돌아간다.
"""
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.core.realtime import hub
from app.models.attendance import Attendance
from app.models.leave import LeaveRequest, LeaveStatus
from app.models.presence import UserPresence

# 직원이 직접 고를 수 있는 상태 (화면 콤보박스 순서)
MANUAL_STATUSES = ("working", "meeting", "meal", "outside", "trip", "leave", "off")
ABSENT = "absent"  # 계산으로만 나오는 상태 (아직 출근 전)
ALL_STATUSES = (*MANUAL_STATUSES, ABSENT)


def effective_status(manual: UserPresence | None, attendance: Attendance | None, on_leave: bool, today: date) -> str:
    if manual is not None and manual.status_date == today and manual.status in ALL_STATUSES:
        return manual.status
    if on_leave:
        return "leave"
    if attendance is not None and attendance.clock_in is not None:
        return "off" if attendance.clock_out is not None else "working"
    return ABSENT


def statuses_for(db: Session, user_ids: list[int], today: date) -> dict[int, str]:
    """여러 직원의 오늘 상태를 쿼리 3번으로 계산한다 (직원 수와 상관없이 고정)."""
    if not user_ids:
        return {}
    manual = {p.user_id: p for p in db.query(UserPresence).filter(UserPresence.user_id.in_(user_ids), UserPresence.status_date == today)}
    attendance = {a.user_id: a for a in db.query(Attendance).filter(Attendance.user_id.in_(user_ids), Attendance.work_date == today)}
    on_leave = {
        uid
        for (uid,) in db.query(LeaveRequest.user_id).filter(
            LeaveRequest.user_id.in_(user_ids),
            LeaveRequest.status == LeaveStatus.approved,
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
        )
    }
    return {uid: effective_status(manual.get(uid), attendance.get(uid), uid in on_leave, today) for uid in user_ids}


def set_status(db: Session, user_id: int, status: str, today: date) -> None:
    """오늘의 상태를 저장한다 (있으면 바꾼다). 커밋은 호출한 쪽이 한다."""
    row = db.get(UserPresence, user_id)
    if row is None:
        db.add(UserPresence(user_id=user_id, status=status, status_date=today))
    else:
        row.status, row.status_date = status, today
        row.updated_at = datetime.now(timezone.utc)


def announce(user_id: int, status: str) -> None:
    """연결된 모든 직원 화면에 이 사람의 새 상태를 알린다 (저장·커밋이 끝난 뒤에 부른다)."""
    hub.broadcast({"type": "presence.updated", "user_id": user_id, "status": status})

