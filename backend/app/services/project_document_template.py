"""견적서/거래명세서를 Doc 폴더에서 옮겨온 실제 양식(backend/app/assets/templates)의 빈 칸에
채워 넣어 엑셀을 만든다. 임의로 새 워크북을 그리지 않고, 서식이 이미 갖춰진 원본 파일을 그대로 사용한다."""
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font
from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.models.project_document import DOC_CURRENCY_SYMBOLS, DocCurrency, ProjectDocType, ProjectDocument

logger = get_logger("ProjectDocumentTemplate")

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "assets" / "templates"

DOC_NO_PLACEHOLDER = "XXXX-XX"

# 단가/합계/소계/부가세/합계 칸은 통화 기호를 숫자 바로 앞에 붙여 표시한다.
TOTAL_MONEY_FORMATS: dict[str, str] = {c.value: f'"{DOC_CURRENCY_SYMBOLS[c]}"#,##0' for c in DocCurrency}

# 상단 "일금 ___ 원정" 줄의 "원정"은 통화 기호가 아니라 고정 텍스트라 서식만으론 안 바뀐다. 통화별 단어로 직접 바꿔준다.
CURRENCY_SUFFIX_WORD: dict[str, str] = {
    DocCurrency.KRW.value: "원정",
    DocCurrency.USD.value: "불정",
    DocCurrency.JPY.value: "엔정",
}

# 소계/부가세/합계 줄은 글자가 없는 서체(HY그래픽M)를 쓰고 있어 ¥ 같은 기호가 네모로 깨진다.
# 통화 서식을 적용할 때는 글꼴도 화폐 기호를 지원하는 서체로 함께 바꿔준다.
MONEY_FONT_NAME = "맑은 고딕"


def _apply_money_format(cell, number_format: str, size: float | None = None) -> None:
    cell.number_format = number_format
    f = cell.font
    cell.font = Font(
        name=MONEY_FONT_NAME, size=size if size is not None else f.sz, bold=f.bold, italic=f.italic, color=f.color, underline=f.underline
    )


def _set_horizontal(cell, horizontal: str) -> None:
    a = cell.alignment
    cell.alignment = Alignment(
        horizontal=horizontal,
        vertical=a.vertical,
        wrap_text=a.wrap_text,
        shrink_to_fit=a.shrink_to_fit,
        indent=a.indent,
    )


@dataclass(frozen=True)
class DocLayout:
    template_filename: str
    date_cell: str
    client_cell: str
    manager_cell: str
    doc_no_cell: str
    top_total_cell: str  # 상단 "합계 / 일금 ___원정" 줄의 금액 칸 (총액을 한 번 더 보여줌)
    total_words_cell: str  # 상단 줄의 "원정" 글자 칸
    item_start_row: int
    item_end_row: int
    subtotal_row: int
    vat_row: int
    total_row: int


# 두 양식은 회사 정보(사업자번호/주소/대표자 등)가 이미 고정 텍스트로 박혀있어 채울 필요가 없고,
# 행 구성만 서로 다르다 (열 의미는 공통: A=번호, B=내용, E=수량, F=단가, G=합계, I=비고).
LAYOUTS: dict[ProjectDocType, DocLayout] = {
    ProjectDocType.quotation: DocLayout(
        template_filename="견적서.xlsx",
        date_cell="H3",
        client_cell="H4",
        manager_cell="H5",
        doc_no_cell="H6",
        top_total_cell="G14",
        total_words_cell="F14",
        item_start_row=17,
        item_end_row=28,
        subtotal_row=29,
        vat_row=30,
        total_row=31,
    ),
    ProjectDocType.statement: DocLayout(
        template_filename="거래명세서.xlsx",
        date_cell="H2",
        client_cell="H3",
        manager_cell="H4",
        doc_no_cell="H5",
        top_total_cell="G12",
        total_words_cell="F12",
        item_start_row=14,
        item_end_row=25,
        subtotal_row=26,
        vat_row=27,
        total_row=28,
    ),
}


def _append_value(current: object, value: str) -> str:
    """'DATE : ' 같은 라벨 뒤에 값을 이어 붙인다. (템플릿 셀에 라벨+값이 한 셀에 들어있음)"""
    label = str(current or "").rstrip()
    return f"{label} {value}" if value else label


def fill_project_document_template(doc: ProjectDocument) -> str:
    """양식 원본을 열어 빈 칸을 채우고 storage에 저장한 뒤, 저장 경로를 반환한다."""
    layout = LAYOUTS[doc.doc_type]
    template_path = TEMPLATE_DIR / layout.template_filename
    logger.debug(f"[ProjectDocumentTemplate] 양식 채우기 시작: doc_id={doc.id}, template={template_path}")

    wb = openpyxl.load_workbook(template_path)
    ws = wb.active

    ws[layout.date_cell] = _append_value(ws[layout.date_cell].value, doc.issue_date.isoformat())
    ws[layout.client_cell] = _append_value(ws[layout.client_cell].value, doc.client_name)
    ws[layout.manager_cell] = _append_value(ws[layout.manager_cell].value, doc.manager_name or "")

    if doc.doc_no:
        current = str(ws[layout.doc_no_cell].value or "")
        ws[layout.doc_no_cell] = current.replace(DOC_NO_PLACEHOLDER, doc.doc_no)
    else:
        # 거래명세서는 견적번호가 필요 없어, 양식에 남아있는 안내 문구(플레이스홀더)를 비워둔다.
        ws[layout.doc_no_cell] = None

    total_money_format = TOTAL_MONEY_FORMATS[doc.currency]

    subtotal = 0
    item_count = min(len(doc.items), layout.item_end_row - layout.item_start_row + 1)
    if len(doc.items) > item_count:
        logger.debug(f"[ProjectDocumentTemplate] 양식 항목 칸({layout.item_end_row}행)을 초과해 나머지는 생략: doc_id={doc.id}")

    for offset in range(layout.item_end_row - layout.item_start_row + 1):
        row = layout.item_start_row + offset
        if offset < item_count:
            item = doc.items[offset]
            amount = item.quantity * item.unit_price
            subtotal += amount
            ws[f"B{row}"] = item.content
            ws[f"E{row}"] = item.quantity
            ws[f"F{row}"] = item.unit_price
            ws[f"G{row}"] = amount
            if item.note:
                ws[f"I{row}"] = item.note
        else:
            # 사용하지 않는 행은 남아있는 수식(예: =E*F)을 지워 0원으로 표시되지 않게 한다.
            ws[f"G{row}"] = None
        # 양식 원본의 회계 서식은 기호가 칸 왼쪽 끝에 떨어져 보여서, 원화 포함 모두 기호를 숫자 바로 앞에 붙이는 서식으로 덮어쓴다.
        _apply_money_format(ws[f"F{row}"], total_money_format)
        _apply_money_format(ws[f"G{row}"], total_money_format)
        # 내용/비고는 가운데 맞춤, 단가/합계(금액)는 오른쪽 맞춤 - 양식 원본은 행마다 정렬이 들쭉날쭉해 통일한다.
        _set_horizontal(ws[f"B{row}"], "center")
        _set_horizontal(ws[f"I{row}"], "center")
        _set_horizontal(ws[f"F{row}"], "right")
        _set_horizontal(ws[f"G{row}"], "right")

    vat = round(subtotal * 0.1)
    total = subtotal + vat
    ws[f"G{layout.subtotal_row}"] = subtotal
    ws[f"G{layout.vat_row}"] = vat
    ws[f"G{layout.total_row}"] = total
    for cell_ref in (f"G{layout.subtotal_row}", f"G{layout.vat_row}", f"G{layout.total_row}", layout.top_total_cell):
        cell = ws[cell_ref]
        # 양식 원본의 최종 합계(세금 포함) 칸만 9pt라 공급가액/부가세(10pt)보다 작아 보여, 같은 크기로 맞춘다.
        _apply_money_format(
            cell, total_money_format, size=ws[f"G{layout.subtotal_row}"].font.sz if cell_ref == f"G{layout.total_row}" else None
        )
        _set_horizontal(cell, "right")
    ws[layout.total_words_cell] = CURRENCY_SUFFIX_WORD[doc.currency]

    os.makedirs(settings.project_documents_dir, exist_ok=True)
    out_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.xlsx")
    wb.save(out_path)
    logger.debug(f"[ProjectDocumentTemplate] 양식 채우기 완료: doc_id={doc.id}, file={out_path}")
    return out_path


def next_doc_no(db: Session, doc_type: ProjectDocType, issue_date: date) -> str:
    """같은 날, 같은 문서 종류 기준으로 발행 순번을 매겨 MMDD-NN 형태로 반환한다."""
    count = (
        db.query(ProjectDocument)
        .filter(ProjectDocument.doc_type == doc_type, ProjectDocument.issue_date == issue_date)
        .count()
    )
    seq = count + 1
    doc_no = f"{issue_date.strftime('%m%d')}-{seq:02d}"
    logger.debug(f"[ProjectDocumentTemplate] 견적번호 채번: doc_type={doc_type}, issue_date={issue_date}, doc_no={doc_no}")
    return doc_no
