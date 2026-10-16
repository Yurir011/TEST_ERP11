"""문서 PDF·엑셀 다운로드."""
import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.project_document import ProjectDocumentStatus
from app.models.user import User

from app.routers.project_documents._common import DOC_TYPE_LABELS_KO, PREFIX, _get_doc_or_404, logger


router = APIRouter(prefix=PREFIX, tags=["project-documents"])


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
