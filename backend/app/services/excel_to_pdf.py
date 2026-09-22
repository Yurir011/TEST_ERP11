"""엑셀(.xlsx) 파일을 실제 Excel로 열어 그대로 PDF로 내보낸다 (사진찍듯이 동일한 결과물).
이 사내 서버는 Windows + Microsoft Excel이 설치된 환경에서만 동작한다."""
import os

import pythoncom
import win32com.client as win32

from app.logging_config import get_logger

logger = get_logger("ExcelToPdf")

XL_TYPE_PDF = 0


def convert_xlsx_to_pdf(xlsx_path: str, pdf_path: str) -> None:
    xlsx_path = os.path.abspath(xlsx_path)
    pdf_path = os.path.abspath(pdf_path)
    logger.debug(f"[ExcelToPdf] 변환 시작: {xlsx_path} -> {pdf_path}")
    pythoncom.CoInitialize()
    excel = None
    try:
        excel = win32.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        wb = excel.Workbooks.Open(xlsx_path)
        try:
            wb.ExportAsFixedFormat(XL_TYPE_PDF, pdf_path)
            logger.debug(f"[ExcelToPdf] 변환 완료: {pdf_path}")
        finally:
            wb.Close(SaveChanges=False)
    finally:
        if excel is not None:
            excel.Quit()
        pythoncom.CoUninitialize()
