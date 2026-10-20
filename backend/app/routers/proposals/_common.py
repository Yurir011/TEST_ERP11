"""품의서 라우터가 함께 쓰는 공통 코드: 첨부 허용 형식, 조회 옵션, 문서 번호, 응답 변환, 결재 진행·삭제 결재 보조."""
import os
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.proposal import DEPARTMENT_CODE, Proposal, ProposalStatus
from app.models.user import JobTitle, User
from app.schemas.proposal import ProposalAttachmentOut, ProposalOut, ProposalStepOut
from app.services.approval_notice import create_decision_notification, create_request_notification

PREFIX = "/api/proposals"

logger = get_logger("Proposals")

ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "application/zip",
}


MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024  # 15MB


_QUERY_OPTIONS = (
    joinedload(Proposal.creator),
    joinedload(Proposal.steps).joinedload(ApprovalStep.approver),
    joinedload(Proposal.attachments),
)


def next_proposal_no(db: Session, issue_date: date) -> str:
    """같은 날짜 기준으로 순번을 매겨 BS-품의-RND-YYMMDD-NN 형태로 반환한다."""
    count = db.query(Proposal).filter(Proposal.issue_date == issue_date).count()
    seq = count + 1
    doc_no = f"BS-품의-{DEPARTMENT_CODE}-{issue_date.strftime('%y%m%d')}-{seq:02d}"
    logger.debug(f"[Proposals] 문서번호 채번: issue_date={issue_date}, doc_no={doc_no}")
    return doc_no


def _to_out(p: Proposal) -> ProposalOut:
    return ProposalOut(
        id=p.id,
        doc_no=p.doc_no,
        kind=p.kind,
        title=p.title,
        topic=p.topic,
        content=p.content,
        department_name=p.department_name,
        issue_date=p.issue_date,
        status=p.status,
        current_step=p.current_step,
        created_by=p.created_by,
        creator_name=p.creator.name,
        is_final_decision=p.is_final_decision,
        steps=[
            ProposalStepOut(
                step_order=s.step_order,
                title=s.title,
                approver_id=s.approver_id,
                approver_name=s.approver.name,
                status=s.status,
                decided_at=s.decided_at,
            )
            for s in p.steps
        ],
        attachments=[ProposalAttachmentOut.model_validate(a) for a in p.attachments],
        has_pdf=bool(p.file_path),
        reject_reason=p.reject_reason,
        delete_requested=bool(p.delete_requested),
        order_sent_at=p.order_sent_at,
        received_at=p.received_at,
        created_at=p.created_at,
    )


def _get_or_404(db: Session, proposal_id: int) -> Proposal:
    p = db.query(Proposal).options(*_QUERY_OPTIONS).filter(Proposal.id == proposal_id).first()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="품의서를 찾을 수 없습니다.")
    return p


def _current_step(p: Proposal) -> ApprovalStep:
    return next(s for s in p.steps if s.step_order == p.current_step)


def _advance_self_approvals(db: Session, p: Proposal, current_user: User) -> None:
    """기안자 본인이 연속된 단계의 결재권자로도 지정된 경우, 그 단계들은 즉시 승인 처리한다.
    더 이상 자기결재로 진행할 수 없으면 그 단계의 결재권자에게 결재 요청 알림을 보낸다."""
    while p.status == ProposalStatus.pending:
        step = _current_step(p)
        if step.approver_id != current_user.id:
            create_request_notification(
                db,
                target_user_id=step.approver_id,
                requester_name=p.creator.name,
                doc_label=f"품의서({p.title})",
                link=f"/project-documents?tab=proposal&open={p.id}",
            )
            logger.debug(
                f"[Proposals] 결재 요청 알림 발송: proposal_id={p.id}, step={step.step_order}, approver_id={step.approver_id}"
            )
            break
        step.status = ApprovalStepStatus.approved
        step.decided_at = datetime.now(timezone.utc)
        logger.debug(f"[Proposals] 자기결재 처리(즉시 승인): id={p.id}, step={step.step_order}, by={current_user.id}")
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


def _delete_label(p: Proposal) -> str:
    return f"품의서 삭제({p.title})"


def _delete_proposal_now(db: Session, p: Proposal) -> None:
    """품의서와 첨부파일, PDF를 실제로 지운다 (commit은 호출자가)."""
    for attachment in p.attachments:
        if attachment.file_path and os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    if p.file_path and os.path.exists(p.file_path):
        os.remove(p.file_path)
    db.delete(p)
    logger.debug(f"[Proposals] 품의서 삭제 완료: id={p.id}")


def _restore_after_delete_rejected(p: Proposal) -> None:
    """삭제 결재가 반려되면 삭제 요청 전의 승인 상태(결재선 포함)로 되돌린다."""
    snap = p.delete_prev_steps or {}
    p.steps = [
        ApprovalStep(
            target_type=ApprovalTargetType.proposal,
            step_order=st["step_order"],
            title=JobTitle(st["title"]),
            approver_id=st["approver_id"],
            status=ApprovalStepStatus(st["status"]),
            decided_at=datetime.fromisoformat(st["decided_at"]) if st.get("decided_at") else None,
        )
        for st in snap.get("steps", [])
    ]
    p.status = ProposalStatus.approved
    p.current_step = snap.get("current_step", 1)
    p.is_final_decision = snap.get("is_final_decision", False)
    p.reject_reason = None
    p.delete_requested = False
    p.delete_prev_steps = None
