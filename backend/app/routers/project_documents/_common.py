"""문서관리 라우터가 함께 쓰는 공통 코드: 상수·라벨, 응답 변환, 조회."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.approval import get_steps, get_steps_map
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalTargetType
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import ProjectDocType, ProjectDocument
from app.schemas.approval import to_approval_step_out
from app.schemas.project_document import ProjectDocumentOut


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
    joinedload(ProjectDocument.creator),
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
        proposal_id=doc.proposal_id,
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
        creator_name=doc.creator.name if doc.creator else "",
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
