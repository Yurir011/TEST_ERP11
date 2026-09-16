import os
from datetime import date
from io import BytesIO

import openpyxl

from app.models.project_document import MAX_ITEMS, ProjectDocumentItem

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "templates", "statement.xlsx")

# 거래명세서.xlsx 템플릿 실측값 (견적서와 같은 구조):
#   H2 = "DATE : ", H3 = "CLIENT : ", H4 = "담당자 : " (라벨 뒤에 값을 이어 붙여서 채운다)
#   품목 표는 13행부터 시작, 내용=B열, 수량=E열, 단가=F열, 비고=I열
#   G열(합계)에는 "=E13*F13" 형태의 수식이 이미 들어있어 손대지 않는다 (엑셀이 자동 재계산)
DATE_CELL = "H2"
CLIENT_CELL = "H3"
MANAGER_CELL = "H4"
ITEM_START_ROW = 13
CONTENT_COL = "B"
QUANTITY_COL = "E"
UNIT_PRICE_COL = "F"
NOTE_COL = "I"


def generate_statement_excel(
    issue_date: date,
    client_name: str,
    manager_name: str | None,
    items: list[ProjectDocumentItem],
) -> bytes:
    """거래명세서.xlsx 템플릿을 열어 날짜/거래처명/담당자와 품목(최대 8개)을 채운 뒤 바이트로 반환한다.
    합계/부가세 등 G열 수식은 템플릿에 이미 들어있으므로 건드리지 않고, 엑셀에서 열 때 자동 재계산되도록 한다.
    """
    wb = openpyxl.load_workbook(TEMPLATE_PATH)
    sheet = wb.worksheets[0]

    date_str = issue_date.strftime("%Y. %m. %d.")
    sheet[DATE_CELL] = f"DATE : {date_str}"
    sheet[CLIENT_CELL] = f"CLIENT : {client_name}"
    sheet[MANAGER_CELL] = f"담당자 : {manager_name or '-'}"

    for i, item in enumerate(items[:MAX_ITEMS]):
        row = ITEM_START_ROW + i
        sheet[f"{CONTENT_COL}{row}"] = item.content
        sheet[f"{QUANTITY_COL}{row}"] = item.quantity
        sheet[f"{UNIT_PRICE_COL}{row}"] = item.unit_price
        if item.note:
            sheet[f"{NOTE_COL}{row}"] = item.note

    wb.calculation.fullCalcOnLoad = True

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
