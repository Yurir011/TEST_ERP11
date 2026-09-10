import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.document import DocumentIssue
from app.models.user import User, UserRole
from app.schemas.document import DocumentIssueRequest, DocumentOut
from app.services.certificate_pdf import DOC_TITLES, generate_certificate_pdf

router = APIRouter(prefix="/api/documents", tags=["documents"])
logger = get_logger("Documents")


@router.post("/issue", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def issue_document(
    payload: DocumentIssueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Documents] 발급 요청: user_id={current_user.id}, type={payload.doc_type}")
    issued_at = datetime.now(timezone.utc)

    record = DocumentIssue(
        user_id=current_user.id,
        doc_type=payload.doc_type,
        purpose=payload.purpose,
        file_path="",
        issued_at=issued_at,
    )
    db.add(record)
    db.flush()  # id 확보 (아직 커밋 전)

    pdf_bytes = generate_certificate_pdf(current_user, payload.doc_type, payload.purpose, issued_at)

    os.makedirs(settings.documents_dir, exist_ok=True)
    filename = f"{record.id}_{payload.doc_type.value}.pdf"
    file_path = os.path.join(settings.documents_dir, filename)
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)

    record.file_path = file_path
    db.commit()
    db.refresh(record)
    logger.debug(f"[Documents] 발급 완료: id={record.id}, file={file_path}")
    return record


@router.get("/me", response_model=list[DocumentOut])
def get_my_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = (
        db.query(DocumentIssue)
        .filter(DocumentIssue.user_id == current_user.id)
        .order_by(DocumentIssue.issued_at.desc())
        .all()
    )
    return records


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    record = db.query(DocumentIssue).filter(DocumentIssue.id == doc_id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    if record.user_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근 권한이 없습니다.")
    if not os.path.exists(record.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일을 찾을 수 없습니다.")

    logger.debug(f"[Documents] 다운로드: id={doc_id}, by={current_user.id}")
    title = DOC_TITLES[record.doc_type]
    download_name = f"{title}_{record.issued_at.date().isoformat()}.pdf"
    return FileResponse(record.file_path, media_type="application/pdf", filename=download_name)
