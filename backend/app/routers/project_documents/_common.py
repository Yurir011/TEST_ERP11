"""문서관리 라우터가 함께 쓰는 공통 코드: 상수·라벨, 응답 변환, 조회, 결재 요청 적용."""
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.approval import advance_chain_self_approvals, build_chain_steps, get_steps, get_steps_map, validate_chain_approvers
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.user import JobTitle, User
from app.schemas.approval import to_approval_step_out
from app.schemas.project_document import ProjectDocumentOut
from app.services.approval_notice import create_decision_notification, create_request_notification
from app.services.tax_invoice_ledger import record_tax_invoice_transaction


PREFIX = "/api/project-documents"

logger = get_logger("ProjectDocuments")


_TARGET = ApprovalTargetType.project_document


DOC_TYPE_LABELS_KO = {
    ProjectDocType.quotation: "견적서",
    ProjectDocType.statement: "거래명세서",
    ProjectDocType.tax_invoice: "세금계산서",
    ProjectDocType.purchase_order: "발주서",
}


def _doc_link(doc_type: ProjectDocType, doc_id: int) -> str:
    base = "/tax-invoices" if doc_type == ProjectDocType.tax_invoice else "/project-documents"
    return f"{base}?open={doc_id}"


_DOC_QUERY_OPTIONS = (
    joinedload(ProjectDocument.project).joinedload(Project.client).joinedload(Client.contacts),
    joinedload(ProjectDocument.other_client).joinedload(Client.contacts),
    joinedload(ProjectDocument.items),
    joinedload(ProjectDocument.approver),
    joinedload(ProjectDocument.images),
)


def _first_contact_email(client: Client | None) -> str | None:
    if client is None:
        return None
    if client.email:
        return client.email
    for contact in client.contacts:
        if contact.email:
            return contact.email
    return None


def _to_out(doc: ProjectDocument, steps: list[ApprovalStep]) -> ProjectDocumentOut:
    return ProjectDocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        project_name=doc.project_display_name,
        doc_type=doc.doc_type,
        issue_date=doc.issue_date,
        doc_no=doc.doc_no,
        currency=doc.currency,
        purpose_type=doc.purpose_type,
        client_name=doc.client_name,
        manager_name=doc.manager_name,
        remark=doc.remark,
        items=doc.items,
        has_pdf=bool(doc.file_path),
        set_id=doc.set_id,
        has_excel=bool(doc.excel_path),
        status=doc.status,
        current_step=doc.current_step,
        steps=[to_approval_step_out(s) for s in steps],
        approver_id=doc.approver_id,
        approver_name=doc.approver.name if doc.approver else None,
        is_final_decision=doc.is_final_decision,
        reviewed_at=doc.reviewed_at,
        reject_reason=doc.reject_reason,
        client_contact_email=_first_contact_email(doc.effective_client),
        created_by=doc.created_by,
        created_at=doc.created_at,
        popbill_issued=bool(doc.popbill_issued_at),
        popbill_nts_confirm_num=doc.popbill_nts_confirm_num,
        popbill_issued_at=doc.popbill_issued_at,
        payment_recorded=doc.payment_recorded,
        direction=doc.direction,
        approval_no=doc.approval_no,
        is_paper=bool(doc.is_paper),
        delete_requested=bool(doc.delete_requested),
        images=doc.images,
    )


def _to_out_db(db: Session, doc: ProjectDocument) -> ProjectDocumentOut:
    return _to_out(doc, get_steps(db, _TARGET, doc.id))


def _to_out_list(db: Session, docs: list[ProjectDocument]) -> list[ProjectDocumentOut]:
    steps_map = get_steps_map(db, _TARGET, [d.id for d in docs])
    return [_to_out(d, steps_map.get(d.id, [])) for d in docs]


def _get_doc_or_404(db: Session, doc_id: int) -> ProjectDocument:
    doc = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    return doc


def _apply_approval_request(
    db: Session,
    doc: ProjectDocument,
    end_title: JobTitle | None,
    approver_ids: list[int],
    is_final_decision: bool,
    current_user: User,
    notify: bool = True,
) -> list[ApprovalStep]:
    """doc.id가 이미 확보된 상태(flush 이후)에서 호출해야 한다. 재요청(반려 후 재작성)인 경우 이전
    결재선은 지우고 새로 만든다."""
    doc.is_final_decision = is_final_decision
    doc.reject_reason = None
    db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == doc.id).delete()
    doc_label = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})"

    if is_final_decision:
        doc.status = ProjectDocumentStatus.approved
        doc.current_step = 1
        doc.approver_id = current_user.id
        doc.reviewed_at = datetime.now(timezone.utc)
        record_tax_invoice_transaction(db, doc, current_user)
        if notify:
            create_decision_notification(
                db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=doc_label, approved=True, link=_doc_link(doc.doc_type, doc.id)
            )
        logger.debug(f"[ProjectDocuments] 전결 처리(즉시 승인): doc_id={doc.id}, by={current_user.id}")
        return []

    chain, approvers = validate_chain_approvers(db, end_title, approver_ids)
    steps = build_chain_steps(db, _TARGET, doc.id, chain, approvers)
    fully_approved = advance_chain_self_approvals(steps, current_user)
    if fully_approved:
        doc.status = ProjectDocumentStatus.approved
        doc.current_step = len(steps)
        doc.approver_id = steps[-1].approver_id
        doc.reviewed_at = datetime.now(timezone.utc)
        record_tax_invoice_transaction(db, doc, current_user)
        if notify:
            create_decision_notification(
                db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=doc_label, approved=True, link=_doc_link(doc.doc_type, doc.id)
            )
        logger.debug(f"[ProjectDocuments] 자기결재 처리(즉시 승인): doc_id={doc.id}, by={current_user.id}")
    else:
        pending_step = next(s for s in steps if s.status == ApprovalStepStatus.pending)
        doc.status = ProjectDocumentStatus.pending
        doc.current_step = pending_step.step_order
        doc.approver_id = pending_step.approver_id
        doc.reviewed_at = None
        if notify:
            create_request_notification(
                db, target_user_id=pending_step.approver_id, requester_name=current_user.name, doc_label=doc_label, link=_doc_link(doc.doc_type, doc.id)
            )
        logger.debug(f"[ProjectDocuments] 결재 요청: doc_id={doc.id}, approver_id={pending_step.approver_id}")
    return steps


def _set_siblings(db: Session, doc: ProjectDocument) -> list[ProjectDocument]:
    """같은 묶음(견적서+거래명세서)에 속한 다른 문서들. 단독 문서면 빈 리스트."""
    if doc.set_id is None:
        return []
    return (
        db.query(ProjectDocument)
        .options(*_DOC_QUERY_OPTIONS)
        .filter(ProjectDocument.set_id == doc.set_id, ProjectDocument.id != doc.id)
        .all()
    )


def _delete_label(doc: ProjectDocument) -> str:
    return f"{DOC_TYPE_LABELS_KO[doc.doc_type]} 삭제({doc.client_name})"
