"""프로젝트 관리의 견적서/거래명세서(sales_documents)를 전자결재(문서관리)와 똑같은 방식으로 만든다.
실제 양식 엑셀의 빈 칸을 채운 뒤, 그 엑셀을 Excel로 열어 PDF로 변환한다."""
import os
from types import SimpleNamespace

from app.config import settings
from app.logging_config import get_logger
from app.models.project_document import DocCurrency, ProjectDocType
from app.models.sales_document import SalesDocType, SalesDocument
from app.services.excel_to_pdf import convert_xlsx_to_pdf
from app.services.project_document_template import fill_project_document_template

logger = get_logger("SalesDocumentTemplate")

_DOC_TYPE_MAP = {SalesDocType.estimate: ProjectDocType.quotation, SalesDocType.statement: ProjectDocType.statement}


def sales_pdf_path(doc: SalesDocument) -> str:
    return os.path.join(settings.project_documents_dir, f"sales_{doc.id}_{doc.doc_type.value}.pdf")


def generate_sales_document_pdf_file(doc: SalesDocument) -> str:
    """양식 엑셀을 채우고 PDF로 변환해 저장한 뒤 PDF 경로를 반환한다. 문서관리 쪽 파일과 이름이 겹치지 않게 sales_ 접두사를 쓴다."""
    # 문서관리(ProjectDocument)용 양식 채우기 함수가 읽는 속성만 갖춘 어댑터. 견적서만 견적번호를 표시한다 (문서관리와 동일).
    adapter = SimpleNamespace(
        id=f"sales_{doc.id}",
        doc_type=_DOC_TYPE_MAP[doc.doc_type],
        issue_date=doc.issue_date,
        client_name=doc.project.client.name,
        manager_name=None,
        doc_no=doc.doc_no if doc.doc_type == SalesDocType.estimate else None,
        currency=DocCurrency.KRW.value,
        items=[
            SimpleNamespace(content=i.name, quantity=i.quantity, unit_price=i.unit_price, note=i.spec) for i in doc.items
        ],
    )
    xlsx_path = fill_project_document_template(adapter)
    pdf_path = sales_pdf_path(doc)
    convert_xlsx_to_pdf(xlsx_path, pdf_path)
    logger.debug(f"[SalesDocumentTemplate] 엑셀/PDF 생성 완료: doc_id={doc.id}, excel={xlsx_path}, pdf={pdf_path}")
    return pdf_path
