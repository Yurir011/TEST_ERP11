"""품의서 결재: 승인·반려, 삭제 결재 요청."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.approval import validate_chain_approvers
from app.core.deps import get_current_user
from app.database import get_db
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.proposal import ProposalStatus
from app.models.user import User, is_admin_role
from app.routers.proposals._common import (
    PREFIX,
    _current_step,
    _delete_label,
    _delete_proposal_now,
    _get_or_404,
    _restore_after_delete_rejected,
    _to_out,
    logger,
)
from app.schemas.proposal import ProposalDeleteRequestIn, ProposalOut, RejectIn
from app.services import proposal_files
from app.services.approval_notice import create_decision_notification, create_request_notification

router = APIRouter(prefix=PREFIX, tags=["proposals"])


@router.put("/{proposal_id}/approve", response_model=ProposalOut)
def approve_proposal(proposal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = _get_or_404(db, proposal_id)
    if p.status != ProposalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 품의서만 승인할 수 있습니다.")
    step = _current_step(p)
    if step.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 승인할 수 있습니다.")

    logger.debug(f"[Proposals] 결재 승인 시도: id={proposal_id}, step={step.step_order}, by={current_user.id}")
    step.status = ApprovalStepStatus.approved
    step.decided_at = datetime.now(timezone.utc)

    if step.step_order == len(p.steps) and p.delete_requested:
        # 삭제 결재가 최종 승인됨: 요청자에게 알리고 품의서를 삭제한다.
        out = _to_out(p).model_copy(update={"status": ProposalStatus.approved})
        create_decision_notification(
            db, target_name=p.creator.name, target_user_id=p.created_by, doc_label=_delete_label(p), approved=True
        )
        _delete_proposal_now(db, p)
        db.commit()
        logger.debug(f"[Proposals] 삭제 결재 최종 승인 → 삭제 완료: id={proposal_id}, by={current_user.id}")
        return out

    if step.step_order == len(p.steps):
        p.status = ProposalStatus.approved
        create_decision_notification(
            db,
            target_name=p.creator.name,
            target_user_id=p.created_by,
            doc_label=f"품의서({p.title})",
            approved=True,
            link=f"/project-documents?tab=proposal&open={p.id}",
        )
    else:
        p.current_step = step.step_order + 1
        next_step = _current_step(p)
        create_request_notification(
            db,
            target_user_id=next_step.approver_id,
            requester_name=p.creator.name,
            doc_label=_delete_label(p) if p.delete_requested else f"품의서({p.title})",
            link=f"/project-documents?tab=proposal&open={p.id}",
        )
        logger.debug(
            f"[Proposals] 다음 결재 요청 알림 발송: proposal_id={p.id}, step={next_step.step_order}, approver_id={next_step.approver_id}"
        )
    db.commit()

    p = _get_or_404(db, p.id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    logger.debug(f"[Proposals] 결재 승인 완료: id={proposal_id}, by={current_user.id}")
    return _to_out(p)


@router.put("/{proposal_id}/reject", response_model=ProposalOut)
def reject_proposal(
    proposal_id: int, payload: RejectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    p = _get_or_404(db, proposal_id)
    if p.status != ProposalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 품의서만 반려할 수 있습니다.")
    step = _current_step(p)
    if step.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 반려할 수 있습니다.")

    if p.delete_requested:
        # 삭제 결재 반려: 품의서는 삭제 요청 전의 승인 상태(결재선 포함)로 되돌아간다.
        create_decision_notification(
            db, target_name=p.creator.name, target_user_id=p.created_by, doc_label=_delete_label(p), approved=False,
            detail=f"반려 사유: {payload.reason}", link=f"/project-documents?tab=proposal&open={p.id}",
        )
        _restore_after_delete_rejected(p)
        db.commit()
        p = _get_or_404(db, p.id)
        proposal_files.regenerate_pdf(p)
        db.commit()
        db.refresh(p)
        logger.debug(f"[Proposals] 삭제 결재 반려 → 승인 상태 복원: id={proposal_id}, by={current_user.id}, reason={payload.reason}")
        return _to_out(p)

    step.status = ApprovalStepStatus.rejected
    step.decided_at = datetime.now(timezone.utc)
    p.status = ProposalStatus.rejected
    p.reject_reason = payload.reason
    create_decision_notification(
        db,
        target_name=p.creator.name,
        target_user_id=p.created_by,
        doc_label=f"품의서({p.title})",
        approved=False,
        detail=f"반려 사유: {payload.reason}",
        link=f"/project-documents?tab=proposal&open={p.id}",
    )
    db.commit()

    p = _get_or_404(db, p.id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    logger.debug(f"[Proposals] 결재 반려: id={proposal_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(p)


@router.post("/{proposal_id}/request-delete", response_model=ProposalOut)
def request_delete_proposal(
    proposal_id: int, payload: ProposalDeleteRequestIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """승인된 품의서의 삭제를 결재 요청한다. 결재가 최종 승인되면 삭제되고, 반려되면 그대로 유지된다."""
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id and not is_admin_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자 또는 관리자만 삭제 결재를 요청할 수 있습니다.")
    if p.status != ProposalStatus.approved or p.delete_requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 품의서만 삭제 결재를 요청할 수 있습니다.")

    chain = approvers = None
    if not payload.is_final_decision:
        chain, approvers = validate_chain_approvers(db, payload.end_title, payload.approver_ids)

    p.delete_prev_steps = {
        "steps": [
            {
                "step_order": st.step_order,
                "title": st.title.value,
                "approver_id": st.approver_id,
                "status": st.status.value,
                "decided_at": st.decided_at.isoformat() if st.decided_at else None,
            }
            for st in p.steps
        ],
        "current_step": p.current_step,
        "is_final_decision": p.is_final_decision,
    }
    p.delete_requested = True
    logger.debug(f"[Proposals] 삭제 결재 요청: id={proposal_id}, by={current_user.id}, final={payload.is_final_decision}")

    if payload.is_final_decision:
        fully_approved = True
    else:
        p.steps = [
            ApprovalStep(
                target_type=ApprovalTargetType.proposal,
                step_order=idx + 1,
                title=step_title,
                approver_id=approver.id,
                status=ApprovalStepStatus.pending,
            )
            for idx, (step_title, approver) in enumerate(zip(chain, approvers))
        ]
        p.status = ProposalStatus.pending
        p.current_step = 1
        db.flush()
        # 요청자 본인이 연속된 단계의 결재권자이면 그 단계들은 즉시 승인 처리한다.
        fully_approved = False
        for step in p.steps:
            if step.approver_id != current_user.id:
                break
            step.status = ApprovalStepStatus.approved
            step.decided_at = datetime.now(timezone.utc)
            if step.step_order == len(p.steps):
                fully_approved = True
            else:
                p.current_step = step.step_order + 1

    if fully_approved:
        out = _to_out(p).model_copy(update={"status": ProposalStatus.approved})
        _delete_proposal_now(db, p)
        db.commit()
        logger.debug(f"[Proposals] 삭제 결재 전결/자기결재로 즉시 삭제: id={proposal_id}")
        return out

    step = _current_step(p)
    create_request_notification(
        db, target_user_id=step.approver_id, requester_name=p.creator.name, doc_label=_delete_label(p),
        link=f"/project-documents?tab=proposal&open={p.id}",
    )
    db.commit()
    p = _get_or_404(db, p.id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)
