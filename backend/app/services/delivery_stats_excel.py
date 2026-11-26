from io import BytesIO

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.schemas.project_delivery import DeliveryStatsOut


def generate_delivery_stats_excel(stats: DeliveryStatsOut) -> bytes:
    """연간 납품 통계(프로젝트×월 개수 표 + 월 합계)를 엑셀 한 장으로 만든다."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{stats.year}년 납품통계"
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")

    headers = ["프로젝트", "거래처"] + [f"{m}월" for m in range(1, 13)] + ["합계 개수", "합계 횟수"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=1, column=col, value=h)
        c.font, c.fill, c.alignment = head_font, head_fill, Alignment(horizontal="center", vertical="center")
    ws.freeze_panes = "C2"
    widths = [28, 16] + [9] * 12 + [12, 10]
    for col, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(col)].width = w

    row = 2
    for p in stats.projects:
        ws.cell(row=row, column=1, value=p.name)
        ws.cell(row=row, column=2, value=p.client_name)
        by_month = {m.month: m for m in p.months}
        for m in range(1, 13):
            if m in by_month:
                ws.cell(row=row, column=2 + m, value=by_month[m].quantity).number_format = "#,##0"
        ws.cell(row=row, column=15, value=p.quantity).number_format = "#,##0"
        ws.cell(row=row, column=16, value=p.count)
        row += 1

    ws.cell(row=row, column=1, value="월 합계 (개수)")
    for m in stats.monthly:
        ws.cell(row=row, column=2 + m.month, value=m.quantity or None).number_format = "#,##0"
    ws.cell(row=row, column=15, value=stats.total_quantity).number_format = "#,##0"
    ws.cell(row=row + 1, column=1, value="월 합계 (횟수)")
    for m in stats.monthly:
        ws.cell(row=row + 1, column=2 + m.month, value=m.count or None)
    ws.cell(row=row + 1, column=16, value=stats.total_count)
    for r in (row, row + 1):
        for col in range(1, 17):
            ws.cell(row=r, column=col).font = Font(bold=True)

    out = BytesIO()
    wb.save(out)
    return out.getvalue()
