import os

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentItem
from app.models.user import User
from app.schemas.project_document import ProjectDocumentCreate, ProjectDocumentOut
from app.services.quotation_excel import generate_quotation_excel
from app.services.statement_excel import generate_statement_excel

router = APIRouter(prefix="/api/project-documents", tags=["project-documents"])
logger = get_logger("ProjectDocuments")

DOC_TYPE_LABELS_KO = {
    ProjectDocType.quotation: "견적서",
    ProjectDocType.statement: "거래명세서",
    ProjectDocType.tax_invoice: "세금계산서",
}

# 문서 유형별 자동 생성 엑셀 파일의 확장자/미디어 타입.
# 견적서는 레거시 바이너리 xls 템플릿, 거래명세서는 xlsx 템플릿을 사용한다.
EXCEL_FILE_INFO = {
    ProjectDocType.quotation: (".xls", "application/vnd.ms-excel"),
    ProjectDocType.statement: (".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
}


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
        has_excel=bool(doc.file_path),
        created_by=doc.created_by,
        created_at=doc.created_at,
    )


@router.get("", response_model=list[ProjectDocumentOut])
def list_project_documents(
    doc_type: ProjectDocType | None = Query(default=None),
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ProjectDocument).options(joinedload(ProjectDocument.project), joinedload(ProjectDocument.items))
    if doc_type is not None:
        query = query.filter(ProjectDocument.doc_type == doc_type)
    if project_id is not None:
        query = query.filter(ProjectDocument.project_id == project_id)
    docs = query.order_by(ProjectDocument.issue_date.desc(), ProjectDocument.id.desc()).all()
    return [_to_out(d) for d in docs]


@router.post("", response_model=ProjectDocumentOut, status_code=status.HTTP_201_CREATED)
def create_project_document(
    payload: ProjectDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 프로젝트입니다.")

    logger.debug(
        f"[ProjectDocuments] 등록: doc_type={payload.doc_type}, project_id={payload.project_id}, "
        f"items={len(payload.items)}, by={current_user.id}"
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
    db.add(doc)
    db.commit()
    db.refresh(doc)
    doc.project = project

    excel_bytes: bytes | None = None
    if doc.doc_type == ProjectDocType.quotation:
        excel_bytes = generate_quotation_excel(doc.issue_date, doc.client_name, doc.manager_name, doc.items)
    elif doc.doc_type == ProjectDocType.statement:
        excel_bytes = generate_statement_excel(doc.issue_date, doc.client_name, doc.manager_name, doc.items)

    if excel_bytes is not None:
        ext, _ = EXCEL_FILE_INFO[doc.doc_type]
        os.makedirs(settings.project_documents_dir, exist_ok=True)
        file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}{ext}")
        with open(file_path, "wb") as f:
            f.write(excel_bytes)
        doc.file_path = file_path
        db.commit()
        db.refresh(doc)
        logger.debug(f"[ProjectDocuments] {DOC_TYPE_LABELS_KO[doc.doc_type]} 엑셀 생성: id={doc.id}, file={file_path}")

    return _to_out(doc)


@router.get("/{doc_id}/excel")
def download_project_document_excel(
    doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="엑셀 파일을 찾을 수 없습니다.")

    logger.debug(f"[ProjectDocuments] 엑셀 다운로드: id={doc_id}, by={current_user.id}")
    ext, media_type = EXCEL_FILE_INFO.get(doc.doc_type, (".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    filename = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}_{doc.issue_date.isoformat()}{ext}"
    return FileResponse(doc.file_path, media_type=media_type, filename=filename)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_document(
    doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    db.delete(doc)
    db.commit()
    logger.debug(f"[ProjectDocuments] 삭제: id={doc_id}, by={current_user.id}")
    return None
