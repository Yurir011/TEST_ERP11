"""품의서 작성·수정·삭제."""
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.approval import validate_chain_approvers
from app.core.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.proposal import DEPARTMENT_CODE, DEPARTMENT_NAME, Proposal, ProposalStatus
from app.models.user import User
from app.routers.proposals._common import (
    PREFIX,
    _advance_self_approvals,
    _get_or_404,
    _to_out,
    logger,
    next_proposal_no,
)
from app.schemas.proposal import ProposalCreate, ProposalOut
from app.services import proposal_files
from app.services.approval_notice import create_decision_notification

router = APIRouter(prefix=PREFIX, tags=["proposals"])


def _valid_project_id(db: Session, project_id: int | None) -> int | None:
    """선택한 프로젝트가 있는지 확인한다 (비어 있으면 일반 구매)."""
    if project_id is None:
        return None
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 프로젝트입니다.")
    return project_id


@router.post("", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
def create_proposal(payload: ProposalCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    issue_date = payload.issue_date or date.today()
    logger.debug(f"[Proposals] 기안일자: {issue_date} (입력값={payload.issue_date})")
    p = Proposal(
        kind=payload.kind or None,
        title=payload.title,
        topic=payload.topic,
        content=payload.content,
        vendor_name=(payload.vendor_name or "").strip() or None,
        project_id=_valid_project_id(db, payload.project_id),
        amount=payload.amount,
        currency=payload.currency,
        issue_date=issue_date,
        department_code=DEPARTMENT_CODE,
        department_name=DEPARTMENT_NAME,
        created_by=current_user.id,
        is_final_decision=payload.is_final_decision,
    )
    p.doc_no = next_proposal_no(db, issue_date)
    p.creator = current_user

    if payload.is_final_decision:
        logger.debug(f"[Proposals] 전결 등록(즉시 승인): title={payload.title}, by={current_user.id}")
        p.status = ProposalStatus.approved
        p.steps = []
        db.add(p)
        db.flush()
        create_decision_notification(
            db,
            target_name=current_user.name,
            target_user_id=current_user.id,
            doc_label=f"품의서({p.title})",
            approved=True,
            link=f"/project-documents?tab=proposal&open={p.id}",
        )
    else:
        chain, approvers = validate_chain_approvers(db, payload.end_title, payload.approver_ids)

        logger.debug(f"[Proposals] 등록: title={payload.title}, end_title={payload.end_title}, by={current_user.id}")
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
        db.add(p)
        db.flush()
        _advance_self_approvals(db, p, current_user)

    db.commit()

    p = _get_or_404(db, p.id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.put("/{proposal_id}", response_model=ProposalOut)
def update_proposal(
    proposal_id: int, payload: ProposalCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """품의서를 수정하고 결재를 다시 요청한다. 반려된 품의서와 승인된 품의서를 작성자가 수정할 수 있으며,
    저장하면 이전 결재 내역은 초기화되고 새로 지정한 결재선으로 처음부터 다시 결재를 받는다."""
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 수정할 수 있습니다.")
    if p.delete_requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="삭제 결재가 진행 중인 품의서는 수정할 수 없습니다.")
    if p.status == ProposalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 품의서는 수정할 수 없습니다.")

    # 결재선 검증은 내용을 바꾸기 전에 한다 (잘못된 요청이면 품의서가 바뀌지 않도록).
    chain = approvers = None
    if not payload.is_final_decision:
        chain, approvers = validate_chain_approvers(db, payload.end_title, payload.approver_ids)

    was_approved = p.status == ProposalStatus.approved
    p.kind = payload.kind or None
    p.title = payload.title
    p.topic = payload.topic
    p.content = payload.content
    p.vendor_name = (payload.vendor_name or "").strip() or None
    p.project_id = _valid_project_id(db, payload.project_id)
    p.amount = payload.amount
    p.currency = payload.currency
    if payload.issue_date:
        p.issue_date = payload.issue_date
    p.is_final_decision = payload.is_final_decision
    p.reject_reason = None
    p.current_step = 1
    logger.debug(f"[Proposals] 수정: id={proposal_id}, was_approved={was_approved}, by={current_user.id}")

    if payload.is_final_decision:
        p.steps = []
        p.status = ProposalStatus.approved
        db.flush()
        create_decision_notification(
            db, target_name=current_user.name, target_user_id=current_user.id, doc_label=f"품의서({p.title})", approved=True,
            link=f"/project-documents?tab=proposal&open={p.id}",
        )
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
        db.flush()
        _advance_self_approvals(db, p, current_user)
    db.commit()

    p = _get_or_404(db, p.id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proposal(proposal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="품의서를 찾을 수 없습니다.")
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 삭제할 수 있습니다.")
    if p.status == ProposalStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 품의서는 삭제 결재를 요청해야 삭제할 수 있습니다.")
    if p.delete_requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="삭제 결재가 진행 중인 품의서입니다.")
    for attachment in p.attachments:
        if attachment.file_path and os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    db.delete(p)
    db.commit()
    logger.debug(f"[Proposals] 삭제: id={proposal_id}, by={current_user.id}")
    return None
