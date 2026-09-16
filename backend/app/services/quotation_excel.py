import os
from datetime import date
from io import BytesIO

import xlrd
from xlutils.copy import copy as xl_copy

from app.models.project_document import MAX_ITEMS, ProjectDocumentItem

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "templates", "quotation.xls")

# 0-index 기준 셀 좌표. 견적서.xls 템플릿 실측값:
#   H2 = "DATE : ", H3 = "CLIENT : ", H4 = "담당자 : " (라벨 뒤에 값을 이어 붙여서 채운다)
#   품목 표는 13행부터 시작, 내용=B열, 수량=E열, 단가=F열, 비고=I열, 최대 8행(13~20행)
DATE_CELL = (1, 7)
CLIENT_CELL = (2, 7)
MANAGER_CELL = (3, 7)
ITEM_START_ROW = 12  # 엑셀 13행
CONTENT_COL = 1  # B
QUANTITY_COL = 4  # E
UNIT_PRICE_COL = 5  # F
NOTE_COL = 8  # I


def generate_quotation_excel(
    issue_date: date,
    client_name: str,
    manager_name: str | None,
    items: list[ProjectDocumentItem],
) -> bytes:
    """견적서.xls 템플릿을 열어 날짜/거래처명/담당자와 품목(최대 8개)을 채운 뒤 바이트로 반환한다."""
    readable_book = xlrd.open_workbook(TEMPLATE_PATH, formatting_info=True)
    writable_book = xl_copy(readable_book)
    sheet = writable_book.get_sheet(0)

    date_str = issue_date.strftime("%Y. %m. %d.")
    sheet.write(*DATE_CELL, f"DATE : {date_str}")
    sheet.write(*CLIENT_CELL, f"CLIENT : {client_name}")
    sheet.write(*MANAGER_CELL, f"담당자 : {manager_name or '-'}")

    for i, item in enumerate(items[:MAX_ITEMS]):
        row = ITEM_START_ROW + i
        sheet.write(row, CONTENT_COL, item.content)
        sheet.write(row, QUANTITY_COL, item.quantity)
        sheet.write(row, UNIT_PRICE_COL, item.unit_price)
        if item.note:
            sheet.write(row, NOTE_COL, item.note)

    buffer = BytesIO()
    writable_book.save(buffer)
    return buffer.getvalue()
