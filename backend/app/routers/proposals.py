import os
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.approval import validate_chain_approvers
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.proposal import (
    DEPARTMENT_CODE,
    DEPARTMENT_NAME,
    Proposal,
    ProposalApprovalStep,
    ProposalAttachment,
    ProposalAttachmentKind,
    ProposalStatus,
    ProposalStepStatus,
)
from app.models.user import User
from app.schemas.proposal import (
    ProposalAttachmentOut,
    ProposalCreate,
    ProposalLinkAttachmentIn,
    ProposalOut,
    ProposalStepOut,
    RejectIn,
)
from app.services.approval_notice import create_decision_notification, create_request_notification
from app.services.proposal_pdf import generate_proposal_pdf

router = APIRouter(prefix="/api/proposals", tags=["proposals"])
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
    joinedload(Proposal.steps).joinedload(ProposalApprovalStep.approver),
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
        created_at=p.created_at,
    )


def _get_or_404(db: Session, proposal_id: int) -> Proposal:
    p = db.query(Proposal).options(*_QUERY_OPTIONS).filter(Proposal.id == proposal_id).first()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="품의서를 찾을 수 없습니다.")
    return p


def _current_step(p: Proposal) -> ProposalApprovalStep:
    return next(s for s in p.steps if s.step_order == p.current_step)


def _regenerate_pdf(p: Proposal) -> None:
    pdf_bytes = generate_proposal_pdf(p)
    os.makedirs(settings.proposals_dir, exist_ok=True)
    file_path = os.path.join(settings.proposals_dir, f"{p.id}_proposal.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    p.file_path = file_path
    logger.debug(f"[Proposals] PDF 생성: id={p.id}, status={p.status}, step={p.current_step}")


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
        step.status = ProposalStepStatus.approved
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


@router.get("", response_model=list[ProposalOut])
def list_proposals(
    status_filter: ProposalStatus | None = Query(default=None, alias="status"),
    approver_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Proposal).options(*_QUERY_OPTIONS)
    if approver_mine:
        query = query.join(ProposalApprovalStep, ProposalApprovalStep.proposal_id == Proposal.id).filter(
            ProposalApprovalStep.approver_id == current_user.id,
            ProposalApprovalStep.step_order == Proposal.current_step,
            Proposal.status == ProposalStatus.pending,
        )
    if status_filter is not None:
        query = query.filter(Proposal.status == status_filter)
    proposals = query.order_by(Proposal.issue_date.desc(), Proposal.id.desc()).all()
    return [_to_out(p) for p in proposals]


@router.post("", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
def create_proposal(payload: ProposalCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    issue_date = date.today()
    p = Proposal(
        kind=payload.kind or None,
        title=payload.title,
        topic=payload.topic,
        content=payload.content,
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
            ProposalApprovalStep(step_order=idx + 1, title=step_title, approver_id=approver.id)
            for idx, (step_title, approver) in enumerate(zip(chain, approvers))
        ]
        db.add(p)
        db.flush()
        _advance_self_approvals(db, p, current_user)

    db.commit()

    p = _get_or_404(db, p.id)
    _regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.put("/{proposal_id}/approve", response_model=ProposalOut)
def approve_proposal(proposal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = _get_or_404(db, proposal_id)
    if p.status != ProposalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 품의서만 승인할 수 있습니다.")
    step = _current_step(p)
    if step.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 승인할 수 있습니다.")

    logger.debug(f"[Proposals] 결재 승인 시도: id={proposal_id}, step={step.step_order}, by={current_user.id}")
    step.status = ProposalStepStatus.approved
    step.decided_at = datetime.now(timezone.utc)

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
            doc_label=f"품의서({p.title})",
            link=f"/project-documents?tab=proposal&open={p.id}",
        )
        logger.debug(
            f"[Proposals] 다음 결재 요청 알림 발송: proposal_id={p.id}, step={next_step.step_order}, approver_id={next_step.approver_id}"
        )
    db.commit()

    p = _get_or_404(db, p.id)
    _regenerate_pdf(p)
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

    step.status = ProposalStepStatus.rejected
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
    _regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    logger.debug(f"[Proposals] 결재 반려: id={proposal_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(p)


@router.get("/{proposal_id}/pdf")
def download_proposal_pdf(proposal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = _get_or_404(db, proposal_id)
    if not p.file_path or not os.path.exists(p.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF 파일을 찾을 수 없습니다.")
    logger.debug(f"[Proposals] PDF 다운로드: id={proposal_id}, by={current_user.id}")
    filename = f"품의서_{p.issue_date.isoformat()}.pdf"
    return FileResponse(p.file_path, media_type="application/pdf", filename=filename)


@router.post("/{proposal_id}/attachments/file", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
def upload_attachment_file(
    proposal_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 첨부파일을 추가할 수 있습니다.")
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 파일 형식입니다.")

    content = file.file.read()
    if len(content) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="파일 크기는 15MB를 초과할 수 없습니다.")

    os.makedirs(settings.proposal_attachments_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1][:10]
    stored_name = f"{proposal_id}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(settings.proposal_attachments_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    attachment = ProposalAttachment(
        proposal_id=p.id,
        kind=ProposalAttachmentKind.file,
        label=file.filename or stored_name,
        file_path=file_path,
        created_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    logger.debug(f"[Proposals] 첨부파일 업로드: proposal_id={proposal_id}, filename={file.filename}, by={current_user.id}")

    p = _get_or_404(db, proposal_id)
    _regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.post("/{proposal_id}/attachments/link", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
def add_attachment_link(
    proposal_id: int,
    payload: ProposalLinkAttachmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 첨부링크를 추가할 수 있습니다.")

    attachment = ProposalAttachment(
        proposal_id=p.id,
        kind=ProposalAttachmentKind.link,
        label=payload.label.strip() if payload.label and payload.label.strip() else payload.url,
        url=payload.url,
        created_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    logger.debug(f"[Proposals] 첨부링크 추가: proposal_id={proposal_id}, url={payload.url}, by={current_user.id}")

    p = _get_or_404(db, proposal_id)
    _regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.get("/{proposal_id}/attachments/{attachment_id}/file")
def download_attachment_file(
    proposal_id: int, attachment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    attachment = (
        db.query(ProposalAttachment)
        .filter(ProposalAttachment.id == attachment_id, ProposalAttachment.proposal_id == proposal_id)
        .first()
    )
    if attachment is None or attachment.kind != ProposalAttachmentKind.file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")
    if not attachment.file_path or not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")
    logger.debug(f"[Proposals] 첨부파일 다운로드: proposal_id={proposal_id}, attachment_id={attachment_id}, by={current_user.id}")
    return FileResponse(attachment.file_path, filename=attachment.label)


@router.delete("/{proposal_id}/attachments/{attachment_id}", response_model=ProposalOut)
def delete_attachment(
    proposal_id: int, attachment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 첨부파일을 삭제할 수 있습니다.")
    attachment = next((a for a in p.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")

    if attachment.file_path and os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)
    db.delete(attachment)
    db.commit()
    logger.debug(f"[Proposals] 첨부파일 삭제: proposal_id={proposal_id}, attachment_id={attachment_id}, by={current_user.id}")

    p = _get_or_404(db, proposal_id)
    _regenerate_pdf(p)
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서는 삭제할 수 없습니다.")
    for attachment in p.attachments:
        if attachment.file_path and os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    db.delete(p)
    db.commit()
    logger.debug(f"[Proposals] 삭제: id={proposal_id}, by={current_user.id}")
    return None
