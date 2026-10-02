from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.approval import advance_chain_self_approvals, build_chain_steps, get_steps, get_steps_map, validate_chain_approvers
from app.core.deps import get_current_user
from app.core.leave_calc import calculate_annual_leave_days, count_business_days, get_leave_year_window
from app.database import get_db
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.leave import LeaveRequest, LeaveStatus
from app.models.schedule import ScheduleEvent
from app.models.user import User, is_admin_role
from app.schemas.approval import to_approval_step_out
from app.schemas.leave import LeaveBalanceOut, LeaveCreate, LeaveOut, RejectIn
from app.services.approval_notice import create_decision_notification, create_request_notification

router = APIRouter(prefix="/api/leaves", tags=["leaves"])
logger = get_logger("Leaves")

_TARGET = ApprovalTargetType.leave

LEAVE_EVENT_COLOR = "sagemint"


def _leave_event_group(leave_id: int) -> str:
    """연차 신청에서 자동 생성된 일정을 식별하는 키 (recurrence_group_id 재사용 - 별도 컬럼/마이그레이션 불필요)."""
    return f"leave-{leave_id}"


def _add_leave_schedule_event(db: Session, record: LeaveRequest) -> None:
    db.add(
        ScheduleEvent(
            title="연차",
            description=record.reason,
            start_date=record.start_date,
            end_date=record.end_date,
            color=LEAVE_EVENT_COLOR,
            recurrence_group_id=_leave_event_group(record.id),
            created_by=record.user_id,
        )
    )
    logger.debug(f"[Leaves] 내 일정에 연차 기록: leave_id={record.id}, {record.start_date}~{record.end_date}")


def _remove_leave_schedule_event(db: Session, leave_id: int) -> None:
    deleted = (
        db.query(ScheduleEvent)
        .filter(ScheduleEvent.recurrence_group_id == _leave_event_group(leave_id))
        .delete(synchronize_session=False)
    )
    logger.debug(f"[Leaves] 내 일정에서 연차 제거: leave_id={leave_id}, deleted={deleted}")


def _to_out(record: LeaveRequest, steps: list[ApprovalStep]) -> LeaveOut:
    return LeaveOut(
        id=record.id,
        user_id=record.user_id,
        user_name=record.user.name,
        start_date=record.start_date,
        end_date=record.end_date,
        days=record.days,
        reason=record.reason,
        status=record.status,
        current_step=record.current_step,
        steps=[to_approval_step_out(s) for s in steps],
        approver_id=record.approver_id,
        approver_name=record.approver.name if record.approver else None,
        is_final_decision=record.is_final_decision,
        reject_reason=record.reject_reason,
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

    doc_label = f"연차 ({payload.start_date} ~ {payload.end_date}, {days}일)"
    steps: list[ApprovalStep] = []

    if not payload.is_final_decision:
        chain, approvers = validate_chain_approvers(db, payload.end_title, payload.approver_ids)

    record = LeaveRequest(
        user_id=current_user.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days=days,
        reason=payload.reason,
        status=LeaveStatus.pending,
        is_final_decision=payload.is_final_decision,
    )
    record.user = current_user
    db.add(record)
    db.flush()  # id 확보 (ApprovalStep.target_id에 필요)
    _add_leave_schedule_event(db, record)

    if payload.is_final_decision:
        record.status = LeaveStatus.approved
        record.approver_id = current_user.id
        record.reviewed_by = current_user.id
        record.reviewed_at = datetime.now(timezone.utc)
        create_decision_notification(
            db,
            target_name=current_user.name,
            target_user_id=current_user.id,
            doc_label=doc_label,
            approved=True,
            link=f"/leaves?open={record.id}",
        )
        logger.debug(f"[Leaves] 전결 처리(즉시 승인): user_id={current_user.id}")
    else:
        steps = build_chain_steps(db, _TARGET, record.id, chain, approvers)
        fully_approved = advance_chain_self_approvals(steps, current_user)
        if fully_approved:
            record.status = LeaveStatus.approved
            record.current_step = len(steps)
            record.approver_id = steps[-1].approver_id
            record.reviewed_by = current_user.id
            record.reviewed_at = datetime.now(timezone.utc)
            create_decision_notification(
                db,
                target_name=current_user.name,
                target_user_id=current_user.id,
                doc_label=doc_label,
                approved=True,
                link=f"/leaves?open={record.id}",
            )
            logger.debug(f"[Leaves] 자기결재 처리(즉시 승인): user_id={current_user.id}")
        else:
            pending_step = next(s for s in steps if s.status == ApprovalStepStatus.pending)
            record.current_step = pending_step.step_order
            record.approver_id = pending_step.approver_id
            create_request_notification(
                db, target_user_id=pending_step.approver_id, requester_name=current_user.name, doc_label=doc_label, link=f"/leaves?open={record.id}"
            )
            logger.debug(f"[Leaves] 결재 요청 알림 발송: approver_id={pending_step.approver_id}")

    db.commit()
    db.refresh(record)
    record.user = current_user
    logger.debug(f"[Leaves] 신청 완료: id={record.id}, days={days}, approver_id={record.approver_id}")
    return _to_out(record, steps)


_LEAVE_QUERY_OPTIONS = (
    joinedload(LeaveRequest.user),
    joinedload(LeaveRequest.approver),
    joinedload(LeaveRequest.reviewer),
)


def _to_out_list(db: Session, records: list[LeaveRequest]) -> list[LeaveOut]:
    steps_map = get_steps_map(db, _TARGET, [r.id for r in records])
    return [_to_out(r, steps_map.get(r.id, [])) for r in records]


@router.get("/me", response_model=list[LeaveOut])
def get_my_leaves(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = (
        db.query(LeaveRequest)
        .options(*_LEAVE_QUERY_OPTIONS)
        .filter(LeaveRequest.user_id == current_user.id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )
    return _to_out_list(db, records)


@router.get("", response_model=list[LeaveOut])
def get_all_leaves(
    status_filter: LeaveStatus | None = Query(default=None, alias="status"),
    approver_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(LeaveRequest).options(*_LEAVE_QUERY_OPTIONS)
    if approver_mine:
        logger.debug(f"[Leaves] 내 결재함 조회: by={current_user.id}, status={status_filter}")
        query = query.filter(LeaveRequest.approver_id == current_user.id)
    else:
        if not is_admin_role(current_user.role):
            logger.debug(f"[Leaves] 전체 조회 권한 없음, 접근 거부: user_id={current_user.id}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
        logger.debug(f"[Leaves] 전체 조회(관리자): by={current_user.id}, status={status_filter}")
    if status_filter is not None:
        query = query.filter(LeaveRequest.status == status_filter)
    records = query.order_by(LeaveRequest.created_at.desc()).all()
    return _to_out_list(db, records)


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
    return _to_out_list(db, records)


@router.get("/{leave_id}", response_model=LeaveOut)
def get_leave(leave_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """업무 알림에서 열 상세 조회. 신청자 본인, 결재선에 포함된 결재권자, 관리자만 볼 수 있다."""
    record = db.query(LeaveRequest).options(*_LEAVE_QUERY_OPTIONS).filter(LeaveRequest.id == leave_id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연차 신청 내역을 찾을 수 없습니다.")
    steps = get_steps(db, _TARGET, record.id)
    is_step_approver = any(st.approver_id == current_user.id for st in steps)
    if record.user_id != current_user.id and not is_step_approver and not is_admin_role(current_user.role):
        logger.debug(f"[Leaves] 상세 조회 권한 없음: id={leave_id}, by={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근 권한이 없습니다.")
    logger.debug(f"[Leaves] 상세 조회: id={leave_id}, by={current_user.id}")
    return _to_out(record, steps)


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
    db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == record.id).delete()
    _remove_leave_schedule_event(db, record.id)
    db.delete(record)
    db.commit()
    logger.debug(f"[Leaves] 취소 완료: id={leave_id}, user_id={current_user.id}")
    return None


def _get_leave_for_approver(db: Session, leave_id: int, current_user: User) -> LeaveRequest:
    record = db.query(LeaveRequest).options(*_LEAVE_QUERY_OPTIONS).filter(LeaveRequest.id == leave_id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연차 신청 내역을 찾을 수 없습니다.")
    if record.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 처리할 수 있습니다.")
    if record.status != LeaveStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 처리된 신청입니다.")
    return record


@router.put("/{leave_id}/approve", response_model=LeaveOut)
def approve_leave(leave_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    logger.debug(f"[Leaves] 승인 시도: id={leave_id}, by={current_user.id}")
    record = _get_leave_for_approver(db, leave_id, current_user)
    steps = get_steps(db, _TARGET, record.id)
    current = next(s for s in steps if s.step_order == record.current_step)

    current.status = ApprovalStepStatus.approved
    current.decided_at = datetime.now(timezone.utc)
    doc_label = f"연차 ({record.start_date} ~ {record.end_date}, {record.days}일)"

    if current.step_order == len(steps):
        record.status = LeaveStatus.approved
        record.reviewed_by = current_user.id
        record.reviewed_at = datetime.now(timezone.utc)
        create_decision_notification(
            db, target_name=record.user.name, target_user_id=record.user_id, doc_label=doc_label, approved=True, link=f"/leaves?open={record.id}"
        )
    else:
        next_step = next(s for s in steps if s.step_order == current.step_order + 1)
        record.current_step = next_step.step_order
        record.approver_id = next_step.approver_id
        create_request_notification(
            db, target_user_id=next_step.approver_id, requester_name=record.user.name, doc_label=doc_label, link=f"/leaves?open={record.id}"
        )
        logger.debug(f"[Leaves] 다음 결재 요청 알림 발송: id={leave_id}, approver_id={next_step.approver_id}")

    db.commit()
    db.refresh(record)
    record.reviewer = current_user
    logger.debug(f"[Leaves] 승인 완료: id={leave_id}, by={current_user.id}")
    return _to_out(record, get_steps(db, _TARGET, record.id))


@router.put("/{leave_id}/reject", response_model=LeaveOut)
def reject_leave(
    leave_id: int, payload: RejectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    logger.debug(f"[Leaves] 반려 시도: id={leave_id}, by={current_user.id}")
    record = _get_leave_for_approver(db, leave_id, current_user)
    steps = get_steps(db, _TARGET, record.id)
    current = next(s for s in steps if s.step_order == record.current_step)
    current.status = ApprovalStepStatus.rejected
    current.decided_at = datetime.now(timezone.utc)

    _remove_leave_schedule_event(db, record.id)
    record.status = LeaveStatus.rejected
    record.reject_reason = payload.reason
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now(timezone.utc)
    create_decision_notification(
        db,
        target_name=record.user.name,
        target_user_id=record.user_id,
        doc_label=f"연차 ({record.start_date} ~ {record.end_date}, {record.days}일)",
        approved=False,
        detail=f"반려 사유: {payload.reason}",
        link=f"/leaves?open={record.id}",
    )
    db.commit()
    db.refresh(record)
    record.reviewer = current_user
    logger.debug(f"[Leaves] 반려 완료: id={leave_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(record, get_steps(db, _TARGET, record.id))
