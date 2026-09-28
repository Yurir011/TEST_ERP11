import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.approval import is_self_approval, resolve_approver
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import (
    ProjectDocType,
    ProjectDocument,
    ProjectDocumentItem,
    ProjectDocumentStatus,
)
from app.models.user import User, has_menu_permission
from app.schemas.project_document import (
    ApprovalRequestIn,
    PopbillIssueOut,
    ProjectDocumentCreate,
    ProjectDocumentOut,
    ProjectDocumentUpdate,
    RejectIn,
)
from app.services.approval_notice import create_decision_notification
from app.services.excel_to_pdf import convert_xlsx_to_pdf
from app.services import popbill_service
from app.services.project_document_excel import generate_project_document_excel
from app.services.project_document_pdf import generate_project_document_pdf
from app.services.project_document_template import fill_project_document_template, next_doc_no
from popbill import PopbillException

TEMPLATED_DOC_TYPES = (ProjectDocType.quotation, ProjectDocType.statement)

router = APIRouter(prefix="/api/project-documents", tags=["project-documents"])
logger = get_logger("ProjectDocuments")

DOC_TYPE_LABELS_KO = {
    ProjectDocType.quotation: "견적서",
    ProjectDocType.statement: "거래명세서",
    ProjectDocType.tax_invoice: "세금계산서",
}

def _doc_link(doc_type: ProjectDocType) -> str:
    return "/tax-invoices" if doc_type == ProjectDocType.tax_invoice else "/project-documents"


_DOC_QUERY_OPTIONS = (
    joinedload(ProjectDocument.project).joinedload(Project.client).joinedload(Client.contacts),
    joinedload(ProjectDocument.items),
    joinedload(ProjectDocument.approver),
)


def _first_contact_email(project: Project) -> str | None:
    if project.client is None:
        return None
    if project.client.email:
        return project.client.email
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
        doc_no=doc.doc_no,
        currency=doc.currency,
        purpose_type=doc.purpose_type,
        client_name=doc.client_name,
        manager_name=doc.manager_name,
        items=doc.items,
        has_pdf=bool(doc.file_path),
        has_excel=bool(doc.excel_path),
        status=doc.status,
        approver_id=doc.approver_id,
        approver_name=doc.approver.name if doc.approver else None,
        reviewed_at=doc.reviewed_at,
        reject_reason=doc.reject_reason,
        client_contact_email=_first_contact_email(doc.project),
        created_by=doc.created_by,
        created_at=doc.created_at,
        popbill_issued=bool(doc.popbill_issued_at),
        popbill_nts_confirm_num=doc.popbill_nts_confirm_num,
        popbill_issued_at=doc.popbill_issued_at,
    )


def _get_doc_or_404(db: Session, doc_id: int) -> ProjectDocument:
    doc = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    return doc


def _apply_approval_request(db: Session, doc: ProjectDocument, approver_id: int, current_user: User) -> None:
    approver = resolve_approver(db, approver_id)
    doc.approver_id = approver.id
    doc.reject_reason = None
    if is_self_approval(approver, current_user):
        doc.status = ProjectDocumentStatus.approved
        doc.reviewed_at = datetime.now(timezone.utc)
        create_decision_notification(
            db,
            target_name=doc.creator.name,
            target_user_id=doc.created_by,
            doc_label=f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})",
            approved=True,
            link=_doc_link(doc.doc_type),
        )
        logger.debug(f"[ProjectDocuments] 자기결재 처리(즉시 승인): doc_id={doc.id}, by={current_user.id}")
    else:
        doc.status = ProjectDocumentStatus.pending
        doc.reviewed_at = None
        logger.debug(f"[ProjectDocuments] 결재 요청: doc_id={doc.id}, approver_id={approver.id}")


def _regenerate_pdf(db: Session, doc: ProjectDocument) -> None:
    pdf_bytes = generate_project_document_pdf(doc, doc.project, doc.project.client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    doc.file_path = file_path
    logger.debug(f"[ProjectDocuments] PDF 생성: doc_id={doc.id}, status={doc.status}, file={file_path}")


def _regenerate_excel(db: Session, doc: ProjectDocument) -> None:
    """승인 완료된 문서만 회계 처리용 엑셀을 함께 생성한다."""
    if doc.status != ProjectDocumentStatus.approved:
        return
    excel_bytes = generate_project_document_excel(doc, doc.project, doc.project.client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.xlsx")
    with open(file_path, "wb") as f:
        f.write(excel_bytes)
    doc.excel_path = file_path
    logger.debug(f"[ProjectDocuments] 엑셀 생성: doc_id={doc.id}, file={file_path}")


def _regenerate_from_template(doc: ProjectDocument) -> None:
    """견적서/거래명세서: 실제 양식 파일의 빈 칸을 채운 엑셀을 만들고, 그 엑셀을 그대로 PDF로 내보낸다."""
    xlsx_path = fill_project_document_template(doc)
    doc.excel_path = xlsx_path
    pdf_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    convert_xlsx_to_pdf(xlsx_path, pdf_path)
    doc.file_path = pdf_path
    logger.debug(f"[ProjectDocuments] 양식 기반 엑셀/PDF 생성 완료: doc_id={doc.id}, excel={xlsx_path}, pdf={pdf_path}")


def _regenerate_documents(db: Session, doc: ProjectDocument) -> None:
    """문서 종류에 맞춰 엑셀/PDF를 다시 만든다. 견적서/거래명세서는 실제 양식을 채우고,
    세금계산서는 기존 방식(빈 워크북에서 직접 그리기)을 그대로 사용한다."""
    if doc.doc_type in TEMPLATED_DOC_TYPES:
        _regenerate_from_template(doc)
    else:
        _regenerate_pdf(db, doc)
        _regenerate_excel(db, doc)


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

    logger.debug(
        f"[ProjectDocuments] 등록: doc_type={payload.doc_type}, project_id={payload.project_id}, "
        f"items={len(payload.items)}, approver_id={payload.approver_id}, by={current_user.id}"
    )
    doc = ProjectDocument(
        project_id=payload.project_id,
        doc_type=payload.doc_type,
        issue_date=payload.issue_date,
        currency=payload.currency.value,
        purpose_type=payload.purpose_type.value,
        client_name=payload.client_name,
        manager_name=payload.manager_name,
        created_by=current_user.id,
    )
    if payload.doc_type == ProjectDocType.quotation:
        doc.doc_no = next_doc_no(db, payload.doc_type, payload.issue_date)
    doc.items = [
        ProjectDocumentItem(content=i.content, quantity=i.quantity, unit_price=i.unit_price, note=i.note, sort_order=idx)
        for idx, i in enumerate(payload.items)
    ]
    doc.creator = current_user
    _apply_approval_request(db, doc, payload.approver_id, current_user)
    db.add(doc)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
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
    doc.currency = payload.currency.value
    doc.purpose_type = payload.purpose_type.value
    doc.client_name = payload.client_name
    doc.manager_name = payload.manager_name
    doc.items = [
        ProjectDocumentItem(content=i.content, quantity=i.quantity, unit_price=i.unit_price, note=i.note, sort_order=idx)
        for idx, i in enumerate(payload.items)
    ]
    doc.status = ProjectDocumentStatus.draft
    doc.approver_id = None
    doc.reject_reason = None
    doc.reviewed_at = None
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
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

    _apply_approval_request(db, doc, payload.approver_id, current_user)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
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
    create_decision_notification(
        db,
        target_name=doc.creator.name,
        target_user_id=doc.created_by,
        doc_label=f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})",
        approved=True,
        link=_doc_link(doc.doc_type),
    )
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    logger.debug(f"[ProjectDocuments] 결재 승인 완료: id={doc_id}, by={current_user.id}")
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
    create_decision_notification(
        db,
        target_name=doc.creator.name,
        target_user_id=doc.created_by,
        doc_label=f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})",
        approved=False,
        detail=f"반려 사유: {payload.reason}",
        link=_doc_link(doc.doc_type),
    )
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
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


@router.get("/{doc_id}/excel")
def download_project_document_excel(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="결재 승인 후에 저장/발송할 수 있습니다.")
    if not doc.excel_path or not os.path.exists(doc.excel_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="엑셀 파일을 찾을 수 없습니다.")

    logger.debug(f"[ProjectDocuments] 엑셀 다운로드: id={doc_id}, by={current_user.id}")
    filename = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}_{doc.issue_date.isoformat()}.xlsx"
    return FileResponse(
        doc.excel_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@router.post("/{doc_id}/popbill/issue", response_model=PopbillIssueOut)
def issue_popbill_tax_invoice(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if not has_menu_permission(current_user, "tax_invoice"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 발행 권한이 없습니다.")
    if doc.doc_type != ProjectDocType.tax_invoice:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="세금계산서만 팝빌로 발행할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 승인 후에 발행할 수 있습니다.")
    if doc.popbill_issued_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 발행된 세금계산서입니다.")

    logger.debug(f"[ProjectDocuments] 팝빌 세금계산서 발행 시도: doc_id={doc_id}, by={current_user.id}")
    try:
        result = popbill_service.issue_tax_invoice(doc, doc.project.client)
    except popbill_service.PopbillConfigError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except PopbillException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"팝빌 오류 [{err.code}] {err.message}")

    doc.popbill_mgt_key = result["mgt_key"]
    doc.popbill_nts_confirm_num = result["nts_confirm_num"]
    doc.popbill_issued_at = datetime.now(timezone.utc)
    db.commit()
    logger.debug(f"[ProjectDocuments] 팝빌 세금계산서 발행 완료: doc_id={doc_id}, nts_confirm_num={doc.popbill_nts_confirm_num}")
    return PopbillIssueOut(nts_confirm_num=doc.popbill_nts_confirm_num, issued_at=doc.popbill_issued_at)


@router.get("/{doc_id}/popbill/view-url")
def get_popbill_view_url(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if not doc.popbill_mgt_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="아직 팝빌로 발행되지 않았습니다.")
    try:
        url = popbill_service.get_view_url(doc)
    except PopbillException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"팝빌 오류 [{err.code}] {err.message}")
    logger.debug(f"[ProjectDocuments] 팝빌 문서 보기 URL 조회: doc_id={doc_id}, by={current_user.id}")
    return {"url": url}


@router.get("/{doc_id}/popbill/pdf-url")
def get_popbill_pdf_url(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if not doc.popbill_mgt_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="아직 팝빌로 발행되지 않았습니다.")
    try:
        url = popbill_service.get_pdf_url(doc)
    except PopbillException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"팝빌 오류 [{err.code}] {err.message}")
    logger.debug(f"[ProjectDocuments] 팝빌 PDF URL 조회: doc_id={doc_id}, by={current_user.id}")
    return {"url": url}


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
