from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.approval import (
    advance_chain_self_approvals,
    approve_current_step,
    build_chain_steps,
    get_steps,
    get_steps_map,
    reject_current_step,
    validate_chain_approvers,
)
from app.core.deps import get_current_user
from app.core.leave_calc import count_business_days
from app.database import get_db
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.leave import LeaveAdjustment, LeaveRequest, LeaveStatus
from app.models.schedule import ScheduleEvent
from app.models.user import User, is_admin_role
from app.schemas.approval import to_approval_step_out
from app.schemas.leave import (
    LeaveAdjustmentCreate,
    LeaveAdjustmentOut,
    LeaveBalanceOut,
    LeaveBalanceRowOut,
    LeaveCreate,
    LeaveOut,
    RejectIn,
)
from app.services.leave_balance import compute_balance
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


@router.get("/balance", response_model=LeaveBalanceOut)
def get_my_balance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return compute_balance(db, current_user, date.today())


def _require_admin(user: User) -> None:
    if not is_admin_role(user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자만 사용할 수 있습니다.")


def _adjustment_out(a: LeaveAdjustment) -> LeaveAdjustmentOut:
    return LeaveAdjustmentOut(
        id=a.id, user_id=a.user_id, days=a.days, reason=a.reason, effective_date=a.effective_date,
        created_by_name=a.creator.name if a.creator else None, created_at=a.created_at,
    )


@router.get("/balances", response_model=list[LeaveBalanceRowOut])
def get_all_balances(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """관리자: 재직 중인 직원 전체의 연차 현황 (입사일 기준 자동 발생 + 조정 − 사용)."""
    _require_admin(current_user)
    users = db.query(User).filter(User.is_active.is_(True)).order_by(User.hire_date, User.id).all()
    today = date.today()
    logger.debug(f"[Leaves] 직원별 연차 현황 조회: count={len(users)}, by={current_user.id}")
    return [LeaveBalanceRowOut(user_id=u.id, user_name=u.name, **compute_balance(db, u, today).model_dump()) for u in users]


@router.get("/adjustments", response_model=list[LeaveAdjustmentOut])
def list_adjustments(user_id: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    rows = (
        db.query(LeaveAdjustment)
        .options(joinedload(LeaveAdjustment.creator))
        .filter(LeaveAdjustment.user_id == user_id)
        .order_by(LeaveAdjustment.effective_date.desc(), LeaveAdjustment.id.desc())
        .all()
    )
    return [_adjustment_out(a) for a in rows]


@router.post("/adjustments", response_model=LeaveAdjustmentOut, status_code=status.HTTP_201_CREATED)
def create_adjustment(payload: LeaveAdjustmentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """관리자: 직원의 연차 일수를 더하거나(+) 뺀다(-). 효력일이 속한 연차 주기에 반영된다."""
    _require_admin(current_user)
    target = db.get(User, payload.user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="직원을 찾을 수 없습니다.")
    adjustment = LeaveAdjustment(
        user_id=payload.user_id,
        days=payload.days,
        reason=payload.reason,
        effective_date=payload.effective_date or date.today(),
        created_by=current_user.id,
    )
    db.add(adjustment)
    db.commit()
    db.refresh(adjustment)
    logger.debug(f"[Leaves] 연차 조정: user_id={payload.user_id}, days={payload.days:+d}, by={current_user.id}")
    return _adjustment_out(adjustment)


@router.delete("/adjustments/{adjustment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adjustment(adjustment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    adjustment = db.get(LeaveAdjustment, adjustment_id)
    if adjustment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="조정 내역을 찾을 수 없습니다.")
    db.delete(adjustment)
    db.commit()
    logger.debug(f"[Leaves] 연차 조정 삭제: id={adjustment_id}, by={current_user.id}")
    return None


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

    balance = compute_balance(db, current_user, payload.start_date)
    # 잔여보다 많이 신청하면 연차를 미리 당겨 쓰는 것으로 보고 잔여가 마이너스가 된다. 다음 주기에 발생할 연차까지만 당겨 쓸 수 있다.
    if balance.remaining - days < -balance.advance_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"당겨 쓸 수 있는 한도를 넘습니다. (잔여 {balance.remaining}일, 최대 {balance.advance_limit}일까지 당겨 쓸 수 있어 {days}일은 신청할 수 없습니다.)",
        )
    if days > balance.remaining:
        logger.debug(f"[Leaves] 연차 당겨 쓰기 신청: user_id={current_user.id}, 잔여={balance.remaining}, 신청={days}")

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
    next_step = approve_current_step(steps, record.current_step)
    doc_label = f"연차 ({record.start_date} ~ {record.end_date}, {record.days}일)"

    if next_step is None:
        record.status = LeaveStatus.approved
        record.reviewed_by = current_user.id
        record.reviewed_at = datetime.now(timezone.utc)
        create_decision_notification(
            db, target_name=record.user.name, target_user_id=record.user_id, doc_label=doc_label, approved=True, link=f"/leaves?open={record.id}"
        )
    else:
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
    reject_current_step(steps, record.current_step)

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
