import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import (
    ApprovalRoute,
    ProjectDocType,
    ProjectDocument,
    ProjectDocumentItem,
    ProjectDocumentStatus,
)
from app.models.user import JobGrade, User, has_menu_permission
from app.schemas.project_document import (
    ApprovalRequestIn,
    ProjectDocumentCreate,
    ProjectDocumentOut,
    ProjectDocumentUpdate,
    RejectIn,
)
from app.services.project_document_pdf import generate_project_document_pdf

router = APIRouter(prefix="/api/project-documents", tags=["project-documents"])
logger = get_logger("ProjectDocuments")

DOC_TYPE_LABELS_KO = {
    ProjectDocType.quotation: "견적서",
    ProjectDocType.statement: "거래명세서",
    ProjectDocType.tax_invoice: "세금계산서",
}

ROUTE_TO_GRADE = {
    ApprovalRoute.chief: JobGrade.chief,
    ApprovalRoute.manager: JobGrade.manager,
}

_DOC_QUERY_OPTIONS = (
    joinedload(ProjectDocument.project).joinedload(Project.client).joinedload(Client.contacts),
    joinedload(ProjectDocument.items),
    joinedload(ProjectDocument.approver),
)


def _first_contact_email(project: Project) -> str | None:
    if project.client is None:
        return None
    for contact in project.client.contacts:
        if contact.email:
            return contact.email
    return None


def _to_out(doc: ProjectDocument) -> ProjectDocumentOut:
    return ProjectDocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        project_name=doc.project.name,
        doc_type=doc.doc_type,
        issue_date=doc.issue_date,
        client_name=doc.client_name,
        manager_name=doc.manager_name,
        items=doc.items,
        has_pdf=bool(doc.file_path),
        status=doc.status,
        approval_route=doc.approval_route,
        approver_id=doc.approver_id,
        approver_name=doc.approver.name if doc.approver else None,
        reviewed_at=doc.reviewed_at,
        reject_reason=doc.reject_reason,
        client_contact_email=_first_contact_email(doc.project),
        created_by=doc.created_by,
        created_at=doc.created_at,
    )


def _get_doc_or_404(db: Session, doc_id: int) -> ProjectDocument:
    doc = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    return doc


def _resolve_approver(db: Session, approval_route: ApprovalRoute, approver_id: int | None, current_user: User) -> int:
    """결재권자 종류에 따라 실제 배정될 approver_id를 검증/결정한다. 전결이면 작성자 본인."""
    if approval_route == ApprovalRoute.self_decision:
        return current_user.id

    if approver_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재권자를 선택해주세요.")

    expected_grade = ROUTE_TO_GRADE[approval_route]
    approver = db.query(User).filter(User.id == approver_id, User.is_active.is_(True)).first()
    if approver is None or approver.grade != expected_grade:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="선택한 결재권자 정보가 올바르지 않습니다.")
    return approver.id


def _apply_approval_request(doc: ProjectDocument, approval_route: ApprovalRoute, approver_id: int, current_user: User) -> None:
    doc.approval_route = approval_route
    doc.approver_id = approver_id
    doc.reject_reason = None
    if approval_route == ApprovalRoute.self_decision:
        doc.status = ProjectDocumentStatus.approved
        doc.reviewed_at = datetime.now(timezone.utc)
        logger.debug(f"[ProjectDocuments] 전결 처리(즉시 승인): doc_id={doc.id}, by={current_user.id}")
    else:
        doc.status = ProjectDocumentStatus.pending
        doc.reviewed_at = None
        logger.debug(
            f"[ProjectDocuments] 결재 요청: doc_id={doc.id}, route={approval_route}, approver_id={approver_id}"
        )


def _regenerate_pdf(db: Session, doc: ProjectDocument) -> None:
    pdf_bytes = generate_project_document_pdf(doc, doc.project, doc.project.client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    doc.file_path = file_path
    logger.debug(f"[ProjectDocuments] PDF 생성: doc_id={doc.id}, status={doc.status}, file={file_path}")


@router.get("", response_model=list[ProjectDocumentOut])
def list_project_documents(
    doc_type: ProjectDocType | None = Query(default=None),
    project_id: int | None = Query(default=None),
    status_filter: ProjectDocumentStatus | None = Query(default=None, alias="status"),
    approver_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS)
    if doc_type is not None:
        query = query.filter(ProjectDocument.doc_type == doc_type)
    if project_id is not None:
        query = query.filter(ProjectDocument.project_id == project_id)
    if status_filter is not None:
        query = query.filter(ProjectDocument.status == status_filter)
    if approver_mine:
        query = query.filter(ProjectDocument.approver_id == current_user.id)
    docs = query.order_by(ProjectDocument.issue_date.desc(), ProjectDocument.id.desc()).all()
    return [_to_out(d) for d in docs]


@router.post("", response_model=ProjectDocumentOut, status_code=status.HTTP_201_CREATED)
def create_project_document(
    payload: ProjectDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if payload.doc_type == ProjectDocType.tax_invoice and not has_menu_permission(current_user, "tax_invoice"):
        logger.debug(f"[ProjectDocuments] 세금계산서 권한 없음, 접근 거부: user_id={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 작성 권한이 없습니다.")

    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 프로젝트입니다.")

    approver_id = _resolve_approver(db, payload.approval_route, payload.approver_id, current_user)

    logger.debug(
        f"[ProjectDocuments] 등록: doc_type={payload.doc_type}, project_id={payload.project_id}, "
        f"items={len(payload.items)}, route={payload.approval_route}, by={current_user.id}"
    )
    doc = ProjectDocument(
        project_id=payload.project_id,
        doc_type=payload.doc_type,
        issue_date=payload.issue_date,
        client_name=payload.client_name,
        manager_name=payload.manager_name,
        created_by=current_user.id,
    )
    doc.items = [
        ProjectDocumentItem(content=i.content, quantity=i.quantity, unit_price=i.unit_price, note=i.note, sort_order=idx)
        for idx, i in enumerate(payload.items)
    ]
    _apply_approval_request(doc, payload.approval_route, approver_id, current_user)
    db.add(doc)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_pdf(db, doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.put("/{doc_id}", response_model=ProjectDocumentOut)
def update_project_document(
    doc_id: int, payload: ProjectDocumentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 수정할 수 있습니다.")
    if doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작성 중이거나 반려된 문서만 수정할 수 있습니다.")

    doc.issue_date = payload.issue_date
    doc.client_name = payload.client_name
    doc.manager_name = payload.manager_name
    doc.items = [
        ProjectDocumentItem(content=i.content, quantity=i.quantity, unit_price=i.unit_price, note=i.note, sort_order=idx)
        for idx, i in enumerate(payload.items)
    ]
    doc.status = ProjectDocumentStatus.draft
    doc.approval_route = None
    doc.approver_id = None
    doc.reject_reason = None
    doc.reviewed_at = None
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_pdf(db, doc)
    db.commit()
    db.refresh(doc)
    logger.debug(f"[ProjectDocuments] 수정: doc_id={doc_id}, by={current_user.id}")
    return _to_out(doc)


@router.post("/{doc_id}/request-approval", response_model=ProjectDocumentOut)
def request_approval(
    doc_id: int, payload: ApprovalRequestIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 결재를 요청할 수 있습니다.")
    if doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작성 중이거나 반려된 문서만 결재 요청할 수 있습니다.")

    approver_id = _resolve_approver(db, payload.approval_route, payload.approver_id, current_user)
    _apply_approval_request(doc, payload.approval_route, approver_id, current_user)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_pdf(db, doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.put("/{doc_id}/approve", response_model=ProjectDocumentOut)
def approve_project_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 승인할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 승인할 수 있습니다.")

    logger.debug(f"[ProjectDocuments] 결재 승인 시도: id={doc_id}, by={current_user.id}")
    doc.status = ProjectDocumentStatus.approved
    doc.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_pdf(db, doc)
    db.commit()
    db.refresh(doc)
    logger.debug(f"[ProjectDocuments] 결재 승인 완료(직인 날인): id={doc_id}, by={current_user.id}")
    return _to_out(doc)


@router.put("/{doc_id}/reject", response_model=ProjectDocumentOut)
def reject_project_document(
    doc_id: int, payload: RejectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 반려할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 반려할 수 있습니다.")

    doc.status = ProjectDocumentStatus.rejected
    doc.reject_reason = payload.reason
    doc.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_pdf(db, doc)
    db.commit()
    db.refresh(doc)
    logger.debug(f"[ProjectDocuments] 결재 반려: id={doc_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(doc)


@router.get("/{doc_id}/pdf")
def download_project_document_pdf(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="결재 승인 후에 저장/출력/발송할 수 있습니다.")
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF 파일을 찾을 수 없습니다.")

    logger.debug(f"[ProjectDocuments] PDF 다운로드: id={doc_id}, by={current_user.id}")
    filename = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}_{doc.issue_date.isoformat()}.pdf"
    return FileResponse(doc.file_path, media_type="application/pdf", filename=filename)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    if doc.status == ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서는 삭제할 수 없습니다.")
    db.delete(doc)
    db.commit()
    logger.debug(f"[ProjectDocuments] 삭제: id={doc_id}, by={current_user.id}")
    return None
