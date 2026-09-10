from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.document_set import DocumentSet
from app.models.project import Project
from app.models.sales_document import SalesDocType, SalesDocument, SalesDocumentItem
from app.models.user import User
from app.schemas.sales_document import (
    SalesDocumentItemOut,
    SalesDocumentOut,
    SalesDocumentSetCreate,
    SalesDocumentSetOut,
)
from app.services.sales_document_pdf import DOC_TITLES, generate_sales_document_pdf

router = APIRouter(prefix="/api/sales-documents", tags=["sales-documents"])
logger = get_logger("SalesDocuments")

DOC_PREFIX = {SalesDocType.estimate: "EST", SalesDocType.statement: "TXN"}


def _to_out(doc: SalesDocument) -> SalesDocumentOut:
    return SalesDocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        project_name=doc.project.name,
        client_name=doc.project.client.name,
        set_id=doc.set_id,
        doc_type=doc.doc_type,
        doc_no=doc.doc_no,
        issue_date=doc.issue_date,
        notes=doc.notes,
        subtotal=doc.subtotal,
        vat=doc.vat,
        total=doc.total,
        created_at=doc.created_at,
        items=[SalesDocumentItemOut.model_validate(i) for i in doc.items],
    )


@router.get("", response_model=list[SalesDocumentOut])
def list_sales_documents(
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = (
        db.query(SalesDocument)
        .options(joinedload(SalesDocument.project).joinedload(Project.client), joinedload(SalesDocument.items))
        .filter(SalesDocument.project_id == project_id)
        .order_by(SalesDocument.set_id.desc(), SalesDocument.doc_type)
        .all()
    )
    return [_to_out(d) for d in docs]


@router.get("/{doc_id}", response_model=SalesDocumentOut)
def get_sales_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = (
        db.query(SalesDocument)
        .options(joinedload(SalesDocument.project).joinedload(Project.client), joinedload(SalesDocument.items))
        .filter(SalesDocument.id == doc_id)
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    return _to_out(doc)


def _build_document(
    db: Session,
    *,
    project: Project,
    set_id: int,
    doc_type: SalesDocType,
    payload: SalesDocumentSetCreate,
    subtotal: int,
    vat: int,
    total: int,
    created_by: int,
) -> SalesDocument:
    doc = SalesDocument(
        project_id=project.id,
        set_id=set_id,
        doc_type=doc_type,
        doc_no=f"{DOC_PREFIX[doc_type]}-{set_id:06d}",
        issue_date=payload.issue_date,
        notes=payload.notes,
        subtotal=subtotal,
        vat=vat,
        total=total,
        created_by=created_by,
    )
    db.add(doc)
    db.flush()

    for item in payload.items:
        db.add(
            SalesDocumentItem(
                document_id=doc.id,
                name=item.name,
                spec=item.spec,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=item.quantity * item.unit_price,
            )
        )
    return doc


@router.post("", response_model=SalesDocumentSetOut, status_code=status.HTTP_201_CREATED)
def create_sales_document_set(
    payload: SalesDocumentSetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    project = (
        db.query(Project).options(joinedload(Project.client)).filter(Project.id == payload.project_id).first()
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 프로젝트입니다.")
    if not payload.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="품목을 1개 이상 입력해주세요.")

    logger.debug(f"[SalesDocuments] 세트 생성 시도: project_id={payload.project_id}, by={current_user.id}")

    subtotal = sum(item.quantity * item.unit_price for item in payload.items)
    vat = round(subtotal * 0.1)
    total = subtotal + vat

    doc_set = DocumentSet(project_id=project.id, created_by=current_user.id)
    db.add(doc_set)
    db.flush()  # set_id 확보 -> 견적서/거래명세서가 같은 일련번호를 공유

    estimate = _build_document(
        db,
        project=project,
        set_id=doc_set.id,
        doc_type=SalesDocType.estimate,
        payload=payload,
        subtotal=subtotal,
        vat=vat,
        total=total,
        created_by=current_user.id,
    )
    statement = _build_document(
        db,
        project=project,
        set_id=doc_set.id,
        doc_type=SalesDocType.statement,
        payload=payload,
        subtotal=subtotal,
        vat=vat,
        total=total,
        created_by=current_user.id,
    )

    db.commit()
    db.refresh(estimate)
    db.refresh(statement)
    estimate.project = project
    statement.project = project
    logger.debug(f"[SalesDocuments] 세트 생성 완료: set_id={doc_set.id}, {estimate.doc_no} / {statement.doc_no}")

    return SalesDocumentSetOut(set_id=doc_set.id, estimate=_to_out(estimate), statement=_to_out(statement))


@router.get("/{doc_id}/download")
def download_sales_document(
    doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = (
        db.query(SalesDocument)
        .options(joinedload(SalesDocument.project).joinedload(Project.client), joinedload(SalesDocument.items))
        .filter(SalesDocument.id == doc_id)
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")

    pdf_bytes = generate_sales_document_pdf(doc, doc.project, doc.project.client)
    logger.debug(f"[SalesDocuments] 다운로드: id={doc_id}, by={current_user.id}")
    filename = f"{DOC_TITLES[doc.doc_type].replace(' ', '')}_{doc.doc_no}.pdf"
    encoded_filename = quote(filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sales_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    doc = db.query(SalesDocument).filter(SalesDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    db.delete(doc)
    db.commit()
    logger.debug(f"[SalesDocuments] 삭제: id={doc_id}, by={current_user.id}")
    return None
