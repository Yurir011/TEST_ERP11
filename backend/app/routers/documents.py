import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.approval import advance_chain_self_approvals, build_chain_steps, get_steps, get_steps_map, validate_chain_approvers
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.document import DocumentIssue, DocumentStatus
from app.models.user import User, is_admin_role
from app.schemas.approval import to_approval_step_out
from app.schemas.document import DocumentIssueRequest, DocumentOut, RejectIn
from app.services.approval_notice import create_decision_notification, create_request_notification
from app.services.certificate_pdf import DOC_TITLES, generate_certificate_pdf

router = APIRouter(prefix="/api/documents", tags=["documents"])
logger = get_logger("Documents")

_TARGET = ApprovalTargetType.document
_DOC_QUERY_OPTIONS = (joinedload(DocumentIssue.user), joinedload(DocumentIssue.approver))


def _to_out(record: DocumentIssue, steps: list[ApprovalStep]) -> DocumentOut:
    return DocumentOut(
        id=record.id,
        user_id=record.user_id,
        user_name=record.user.name,
        doc_type=record.doc_type,
        purpose=record.purpose,
        status=record.status,
        current_step=record.current_step,
        steps=[to_approval_step_out(s) for s in steps],
        approver_id=record.approver_id,
        approver_name=record.approver.name if record.approver else None,
        is_final_decision=record.is_final_decision,
        reviewed_at=record.reviewed_at,
        reject_reason=record.reject_reason,
        has_pdf=bool(record.file_path),
        issued_at=record.issued_at,
    )


def _to_out_list(db: Session, records: list[DocumentIssue]) -> list[DocumentOut]:
    steps_map = get_steps_map(db, _TARGET, [r.id for r in records])
    return [_to_out(r, steps_map.get(r.id, [])) for r in records]


def _get_doc_or_404(db: Session, doc_id: int) -> DocumentIssue:
    record = db.query(DocumentIssue).options(*_DOC_QUERY_OPTIONS).filter(DocumentIssue.id == doc_id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    return record


def _issue_pdf(record: DocumentIssue, user: User) -> None:
    pdf_bytes = generate_certificate_pdf(user, record.doc_type, record.purpose, datetime.now(timezone.utc))
    os.makedirs(settings.documents_dir, exist_ok=True)
    file_path = os.path.join(settings.documents_dir, f"{record.id}_{record.doc_type.value}.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    record.file_path = file_path
    logger.debug(f"[Documents] PDF 생성: id={record.id}, file={file_path}")


@router.post("/request", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def request_document(
    payload: DocumentIssueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Documents] 발급 신청: user_id={current_user.id}, type={payload.doc_type}, end_title={payload.end_title}")
    doc_label = DOC_TITLES[payload.doc_type]
    steps: list[ApprovalStep] = []

    if payload.is_final_decision:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="재직/경력증명서는 전결로 처리할 수 없습니다.")
    chain, approvers = validate_chain_approvers(db, payload.end_title, payload.approver_ids)

    record = DocumentIssue(
        user_id=current_user.id,
        doc_type=payload.doc_type,
        purpose=payload.purpose,
        status=DocumentStatus.pending,
        is_final_decision=payload.is_final_decision,
    )
    record.user = current_user
    db.add(record)
    db.flush()  # id 확보 (ApprovalStep.target_id / PDF 파일명에 필요)

    if payload.is_final_decision:
        record.status = DocumentStatus.approved
        record.approver_id = current_user.id
        record.reviewed_at = datetime.now(timezone.utc)
        _issue_pdf(record, current_user)
        create_decision_notification(
            db, target_name=current_user.name, target_user_id=current_user.id, doc_label=doc_label, approved=True, link=f"/documents?open={record.id}"
        )
        logger.debug(f"[Documents] 전결 처리(즉시 승인): id={record.id}, by={current_user.id}")
    else:
        steps = build_chain_steps(db, _TARGET, record.id, chain, approvers)
        fully_approved = advance_chain_self_approvals(steps, current_user)
        if fully_approved:
            record.status = DocumentStatus.approved
            record.current_step = len(steps)
            record.approver_id = steps[-1].approver_id
            record.reviewed_at = datetime.now(timezone.utc)
            _issue_pdf(record, current_user)
            create_decision_notification(
                db, target_name=current_user.name, target_user_id=current_user.id, doc_label=doc_label, approved=True, link=f"/documents?open={record.id}"
            )
            logger.debug(f"[Documents] 자기결재 처리(즉시 승인): id={record.id}, by={current_user.id}")
        else:
            pending_step = next(s for s in steps if s.status == ApprovalStepStatus.pending)
            record.current_step = pending_step.step_order
            record.approver_id = pending_step.approver_id
            create_request_notification(
                db, target_user_id=pending_step.approver_id, requester_name=current_user.name, doc_label=doc_label, link=f"/documents?open={record.id}"
            )
            logger.debug(f"[Documents] 결재 요청 알림 발송: approver_id={pending_step.approver_id}")

    db.commit()
    db.refresh(record)
    logger.debug(f"[Documents] 발급 신청 완료: id={record.id}")
    return _to_out(record, steps)


@router.get("", response_model=list[DocumentOut])
def list_documents(
    status_filter: DocumentStatus | None = Query(default=None, alias="status"),
    approver_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(DocumentIssue).options(*_DOC_QUERY_OPTIONS)
    if approver_mine:
        logger.debug(f"[Documents] 내 결재함 조회: by={current_user.id}, status={status_filter}")
        query = query.filter(DocumentIssue.approver_id == current_user.id)
    elif not is_admin_role(current_user.role):
        logger.debug(f"[Documents] 전체 조회 권한 없음, 접근 거부: user_id={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
    if status_filter is not None:
        query = query.filter(DocumentIssue.status == status_filter)
    records = query.order_by(DocumentIssue.issued_at.desc()).all()
    return _to_out_list(db, records)


@router.get("/me", response_model=list[DocumentOut])
def get_my_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = (
        db.query(DocumentIssue)
        .options(*_DOC_QUERY_OPTIONS)
        .filter(DocumentIssue.user_id == current_user.id)
        .order_by(DocumentIssue.issued_at.desc())
        .all()
    )
    return _to_out_list(db, records)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """업무 알림에서 열 상세 조회. 신청자 본인, 결재선에 포함된 결재권자, 관리자만 볼 수 있다."""
    record = _get_doc_or_404(db, doc_id)
    steps = get_steps(db, _TARGET, record.id)
    is_step_approver = any(s.approver_id == current_user.id for s in steps)
    if record.user_id != current_user.id and not is_step_approver and not is_admin_role(current_user.role):
        logger.debug(f"[Documents] 상세 조회 권한 없음: id={doc_id}, by={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근 권한이 없습니다.")
    logger.debug(f"[Documents] 상세 조회: id={doc_id}, by={current_user.id}")
    return _to_out(record, steps)


def _get_doc_for_approver(db: Session, doc_id: int, current_user: User) -> DocumentIssue:
    record = _get_doc_or_404(db, doc_id)
    if record.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 처리할 수 있습니다.")
    if record.status != DocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 처리할 수 있습니다.")
    return record


@router.put("/{doc_id}/approve", response_model=DocumentOut)
def approve_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    logger.debug(f"[Documents] 결재 승인 시도: id={doc_id}, by={current_user.id}")
    record = _get_doc_for_approver(db, doc_id, current_user)
    steps = get_steps(db, _TARGET, record.id)
    current = next(s for s in steps if s.step_order == record.current_step)
    current.status = ApprovalStepStatus.approved
    current.decided_at = datetime.now(timezone.utc)

    if current.step_order == len(steps):
        record.status = DocumentStatus.approved
        record.reviewed_at = datetime.now(timezone.utc)
        _issue_pdf(record, record.user)
        create_decision_notification(
            db,
            target_name=record.user.name,
            target_user_id=record.user_id,
            doc_label=DOC_TITLES[record.doc_type],
            approved=True,
            link=f"/documents?open={record.id}",
        )
    else:
        next_step = next(s for s in steps if s.step_order == current.step_order + 1)
        record.current_step = next_step.step_order
        record.approver_id = next_step.approver_id
        create_request_notification(
            db,
            target_user_id=next_step.approver_id,
            requester_name=record.user.name,
            doc_label=DOC_TITLES[record.doc_type],
            link=f"/documents?open={record.id}",
        )
        logger.debug(f"[Documents] 다음 결재 요청 알림 발송: id={doc_id}, approver_id={next_step.approver_id}")

    db.commit()
    db.refresh(record)
    logger.debug(f"[Documents] 결재 승인 완료: id={doc_id}, by={current_user.id}")
    return _to_out(record, get_steps(db, _TARGET, record.id))


@router.put("/{doc_id}/reject", response_model=DocumentOut)
def reject_document(
    doc_id: int, payload: RejectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    logger.debug(f"[Documents] 결재 반려 시도: id={doc_id}, by={current_user.id}")
    record = _get_doc_for_approver(db, doc_id, current_user)
    steps = get_steps(db, _TARGET, record.id)
    current = next(s for s in steps if s.step_order == record.current_step)
    current.status = ApprovalStepStatus.rejected
    current.decided_at = datetime.now(timezone.utc)

    record.status = DocumentStatus.rejected
    record.reject_reason = payload.reason
    record.reviewed_at = datetime.now(timezone.utc)
    create_decision_notification(
        db,
        target_name=record.user.name,
        target_user_id=record.user_id,
        doc_label=DOC_TITLES[record.doc_type],
        approved=False,
        detail=f"반려 사유: {payload.reason}",
        link=f"/documents?open={record.id}",
    )
    db.commit()
    db.refresh(record)
    logger.debug(f"[Documents] 결재 반려 완료: id={doc_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(record, get_steps(db, _TARGET, record.id))


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    record = _get_doc_or_404(db, doc_id)
    is_step_approver = any(s.approver_id == current_user.id for s in get_steps(db, _TARGET, record.id))
    if record.user_id != current_user.id and not is_step_approver and not is_admin_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근 권한이 없습니다.")
    if record.status != DocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="결재 승인 후에 다운로드할 수 있습니다.")
    if not record.file_path or not os.path.exists(record.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일을 찾을 수 없습니다.")

    logger.debug(f"[Documents] 다운로드: id={doc_id}, by={current_user.id}")
    title = DOC_TITLES[record.doc_type]
    download_name = f"{title}_{record.issued_at.date().isoformat()}.pdf"
    return FileResponse(record.file_path, media_type="application/pdf", filename=download_name)
