"""문서관리 문서의 PDF·엑셀 파일 생성 (라우터에서 호출한다).

견적서·거래명세서·세금계산서·발주서는 실제 양식 파일의 빈 칸을 채운 엑셀을 만들고 그 엑셀을 PDF로 내보낸다.
그 외 종류는 직접 그린 PDF와 (승인 후) 회계용 엑셀을 만든다. 파일 경로는 문서(file_path/excel_path)에 기록하고 commit 은 호출한 쪽이 한다.
"""
import os

from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.services.excel_to_pdf import convert_xlsx_to_pdf
from app.services.project_document_excel import generate_project_document_excel
from app.services.project_document_pdf import generate_project_document_pdf
from app.services.project_document_template import fill_project_document_template

logger = get_logger("ProjectDocuments")

TEMPLATED_DOC_TYPES = (ProjectDocType.quotation, ProjectDocType.statement, ProjectDocType.tax_invoice, ProjectDocType.purchase_order)


def regenerate_pdf(db: Session, doc: ProjectDocument) -> None:
    pdf_bytes = generate_project_document_pdf(doc, doc.project, doc.effective_client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    doc.file_path = file_path
    logger.debug(f"[ProjectDocuments] PDF 생성: doc_id={doc.id}, status={doc.status}, file={file_path}")


def regenerate_excel(db: Session, doc: ProjectDocument) -> None:
    """승인 완료된 문서만 회계 처리용 엑셀을 함께 생성한다."""
    if doc.status != ProjectDocumentStatus.approved:
        return
    excel_bytes = generate_project_document_excel(doc, doc.project, doc.effective_client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.xlsx")
    with open(file_path, "wb") as f:
        f.write(excel_bytes)
    doc.excel_path = file_path
    logger.debug(f"[ProjectDocuments] 엑셀 생성: doc_id={doc.id}, file={file_path}")


def regenerate_from_template(doc: ProjectDocument) -> None:
    """견적서/거래명세서: 실제 양식 파일의 빈 칸을 채운 엑셀을 만들고, 그 엑셀을 그대로 PDF로 내보낸다."""
    xlsx_path = fill_project_document_template(doc)
    doc.excel_path = xlsx_path
    pdf_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    convert_xlsx_to_pdf(xlsx_path, pdf_path)
    doc.file_path = pdf_path
    logger.debug(f"[ProjectDocuments] 양식 기반 엑셀/PDF 생성 완료: doc_id={doc.id}, excel={xlsx_path}, pdf={pdf_path}")


def regenerate_documents(db: Session, doc: ProjectDocument) -> None:
    """문서 종류에 맞춰 엑셀/PDF를 다시 만든다. 견적서/거래명세서는 실제 양식을 채우고,
    세금계산서는 기존 방식(빈 워크북에서 직접 그리기)을 그대로 사용한다."""
    if doc.doc_type in TEMPLATED_DOC_TYPES:
        regenerate_from_template(doc)
    else:
        regenerate_pdf(db, doc)
        regenerate_excel(db, doc)
