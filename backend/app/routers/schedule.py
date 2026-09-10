import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.schedule import ScheduleEvent
from app.models.user import User, UserRole
from app.schemas.schedule import MAX_OCCURRENCES, ScheduleEventCreate, ScheduleEventOut, ScheduleReorderRequest

router = APIRouter(prefix="/api/schedule", tags=["schedule"])
logger = get_logger("Schedule")


def _to_out(event: ScheduleEvent) -> ScheduleEventOut:
    return ScheduleEventOut(
        id=event.id,
        title=event.title,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        color=event.color,
        is_completed=event.is_completed,
        sort_order=event.sort_order,
        recurrence_group_id=event.recurrence_group_id,
        created_by=event.created_by,
        created_by_name=event.creator.name,
        created_at=event.created_at,
    )


@router.get("", response_model=list[ScheduleEventOut])
def list_events(
    start: date = Query(...),
    end: date = Query(..., description="조회 종료일 (포함)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    range_end_exclusive = end + timedelta(days=1)
    events = (
        db.query(ScheduleEvent)
        .options(joinedload(ScheduleEvent.creator))
        .filter(ScheduleEvent.start_date < range_end_exclusive, ScheduleEvent.end_date >= start)
        .order_by(ScheduleEvent.sort_order, ScheduleEvent.id)
        .all()
    )
    return [_to_out(e) for e in events]


def _to_js_weekday(d: date) -> int:
    """Python date.weekday()(월=0)를 JS Date.getDay()(일=0) 기준으로 변환."""
    return (d.weekday() + 1) % 7


def _generate_occurrence_starts(payload: ScheduleEventCreate) -> list[date]:
    if payload.recurrence_freq == "none":
        return [payload.start_date]

    starts: list[date] = []
    until = payload.recurrence_until

    if payload.recurrence_freq == "daily":
        cursor = payload.start_date
        while cursor <= until:
            starts.append(cursor)
            cursor += timedelta(days=1)
    elif payload.recurrence_freq == "weekly":
        weekdays = set(payload.recurrence_weekdays or [])
        cursor = payload.start_date
        while cursor <= until:
            if _to_js_weekday(cursor) in weekdays:
                starts.append(cursor)
            cursor += timedelta(days=1)
    elif payload.recurrence_freq == "yearly":
        year = payload.start_date.year
        while True:
            try:
                occurrence = payload.start_date.replace(year=year)
            except ValueError:
                occurrence = date(year, payload.start_date.month, 28)  # 2/29 보정
            if occurrence > until:
                break
            starts.append(occurrence)
            year += 1

    if not starts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="조건에 맞는 반복 일정이 없습니다.")
    if len(starts) > MAX_OCCURRENCES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"반복 일정은 최대 {MAX_OCCURRENCES}회까지 생성할 수 있습니다. 종료일을 조정해주세요.",
        )
    return starts


@router.post("", response_model=ScheduleEventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: ScheduleEventCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료일은 시작일보다 빠를 수 없습니다.")

    occurrence_starts = _generate_occurrence_starts(payload)
    duration = (payload.end_date - payload.start_date).days
    group_id = str(uuid.uuid4()) if payload.recurrence_freq != "none" else None

    logger.debug(
        f"[Schedule] 일정 등록: title={payload.title}, occurrences={len(occurrence_starts)}, by={current_user.id}"
    )

    created_events = []
    for occ_start in occurrence_starts:
        event = ScheduleEvent(
            title=payload.title,
            description=payload.description,
            start_date=occ_start,
            end_date=occ_start + timedelta(days=duration),
            color=payload.color,
            recurrence_group_id=group_id,
            created_by=current_user.id,
        )
        db.add(event)
        created_events.append(event)

    db.flush()  # id 확보 -> sort_order 기본값으로 사용 (생성 순서를 보장해 이후 위/아래 이동이 실제로 동작하게 함)
    for event in created_events:
        event.sort_order = event.id
    db.commit()
    for event in created_events:
        db.refresh(event)
        event.creator = current_user

    return _to_out(created_events[0])


def _get_editable_event(db: Session, event_id: int, current_user: User) -> ScheduleEvent:
    event = db.query(ScheduleEvent).options(joinedload(ScheduleEvent.creator)).filter(ScheduleEvent.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="일정을 찾을 수 없습니다.")
    if event.created_by != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="본인이 등록한 일정만 수정·삭제할 수 있습니다.")
    return event


@router.put("/{event_id}", response_model=ScheduleEventOut)
def update_event(
    event_id: int,
    payload: ScheduleEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = _get_editable_event(db, event_id, current_user)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료일은 시작일보다 빠를 수 없습니다.")

    event.title = payload.title
    event.description = payload.description
    event.start_date = payload.start_date
    event.end_date = payload.end_date
    event.color = payload.color
    db.commit()
    db.refresh(event)
    logger.debug(f"[Schedule] 일정 수정: id={event_id}, by={current_user.id}")
    return _to_out(event)


@router.put("/{event_id}/complete", response_model=ScheduleEventOut)
def toggle_complete(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = _get_editable_event(db, event_id, current_user)
    event.is_completed = not event.is_completed
    db.commit()
    db.refresh(event)
    logger.debug(f"[Schedule] 완료 토글: id={event_id}, is_completed={event.is_completed}, by={current_user.id}")
    return _to_out(event)


@router.put("/{event_id}/reorder", response_model=list[ScheduleEventOut])
def reorder_event(
    event_id: int,
    payload: ScheduleReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.direction not in ("up", "down"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="direction은 up 또는 down이어야 합니다.")

    _get_editable_event(db, event_id, current_user)  # 권한 확인

    day_events = (
        db.query(ScheduleEvent)
        .options(joinedload(ScheduleEvent.creator))
        .filter(ScheduleEvent.start_date <= payload.date, ScheduleEvent.end_date >= payload.date)
        .order_by(ScheduleEvent.sort_order, ScheduleEvent.id)
        .all()
    )

    index = next((i for i, e in enumerate(day_events) if e.id == event_id), None)
    if index is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="해당 날짜의 일정을 찾을 수 없습니다.")

    neighbor_index = index - 1 if payload.direction == "up" else index + 1
    if 0 <= neighbor_index < len(day_events):
        current_event = day_events[index]
        neighbor_event = day_events[neighbor_index]
        current_event.sort_order, neighbor_event.sort_order = neighbor_event.sort_order, current_event.sort_order
        db.commit()
        for e in (current_event, neighbor_event):
            db.refresh(e)
        logger.debug(f"[Schedule] 순서 변경: id={event_id}, direction={payload.direction}, by={current_user.id}")
        day_events.sort(key=lambda e: (e.sort_order, e.id))

    return [_to_out(e) for e in day_events]


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = _get_editable_event(db, event_id, current_user)
    db.delete(event)
    db.commit()
    logger.debug(f"[Schedule] 일정 삭제: id={event_id}, by={current_user.id}")
    return None
