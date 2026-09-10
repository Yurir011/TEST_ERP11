from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.client import Client
from app.models.project import Project
from app.models.sales_document import SalesDocType, SalesDocument
from app.services.certificate_pdf import FONT_BOLD, FONT_REGULAR, _ensure_fonts_registered

DOC_TITLES = {
    SalesDocType.estimate: "견 적 서",
    SalesDocType.statement: "거 래 명 세 서",
}


def generate_sales_document_pdf(doc: SalesDocument, project: Project, client: Client) -> bytes:
    _ensure_fonts_registered()

    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    title_style = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=22, alignment=1, spaceAfter=8 * mm)
    meta_style = ParagraphStyle("Meta", fontName=FONT_REGULAR, fontSize=10, alignment=1, textColor=colors.grey)
    section_style = ParagraphStyle("Section", fontName=FONT_BOLD, fontSize=11, spaceBefore=6 * mm, spaceAfter=2 * mm)
    body_style = ParagraphStyle("Body", fontName=FONT_REGULAR, fontSize=10, leading=15)
    small_style = ParagraphStyle("Small", fontName=FONT_REGULAR, fontSize=9, leading=13, textColor=colors.grey)

    def party_table(rows: list[tuple[str, str]]) -> Table:
        t = Table(
            [[Paragraph(k, small_style), Paragraph(v or "-", body_style)] for k, v in rows],
            colWidths=[28 * mm, 62 * mm],
        )
        t.setStyle(
            TableStyle(
                [
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        return t

    supplier_rows = [
        ("상호", settings.company_name),
        ("대표자", settings.company_ceo_name or "-"),
        ("사업자번호", settings.company_reg_no or "-"),
        ("주소", settings.company_address or "-"),
    ]
    client_rows = [
        ("상호", client.name),
        ("대표자", client.ceo_name or "-"),
        ("사업자번호", client.biz_reg_no or "-"),
        ("주소", client.address or "-"),
    ]

    parties = Table(
        [[party_table(client_rows), party_table(supplier_rows)]],
        colWidths=[95 * mm, 95 * mm],
    )
    parties.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (0, 0), 0.5, colors.HexColor("#e5e4e7")),
                ("BOX", (1, 0), (1, 0), 0.5, colors.HexColor("#e5e4e7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    item_header = ["품목", "규격", "수량", "단가", "금액"]
    item_rows = [item_header]
    for item in doc.items:
        item_rows.append(
            [
                item.name,
                item.spec or "-",
                f"{item.quantity:,}",
                f"{item.unit_price:,}",
                f"{item.amount:,}",
            ]
        )

    items_table = Table(item_rows, colWidths=[55 * mm, 35 * mm, 20 * mm, 30 * mm, 30 * mm])
    items_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2f2f3")),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (1, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e4e7")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    totals_table = Table(
        [
            ["공급가액", f"{doc.subtotal:,} 원"],
            ["부가세(10%)", f"{doc.vat:,} 원"],
            ["합계", f"{doc.total:,} 원"],
        ],
        colWidths=[140 * mm, 30 * mm],
    )
    totals_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
                ("FONTNAME", (0, 2), (-1, 2), FONT_BOLD),
                ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                ("LINEABOVE", (0, 2), (-1, 2), 0.8, colors.HexColor("#1f2024")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )

    elements = [
        Paragraph(DOC_TITLES[doc.doc_type], title_style),
        Paragraph(f"문서번호 : {doc.doc_no}    발행일 : {doc.issue_date.isoformat()}", meta_style),
        Spacer(1, 8 * mm),
        Paragraph(f"프로젝트 : {project.name}", body_style),
        Spacer(1, 4 * mm),
        parties,
        Spacer(1, 8 * mm),
        Paragraph("품목 내역", section_style),
        items_table,
        Spacer(1, 4 * mm),
        totals_table,
    ]

    if doc.notes:
        elements += [
            Paragraph("비고", section_style),
            Paragraph(doc.notes.replace("\n", "<br/>"), body_style),
        ]

    pdf.build(elements)
    return buffer.getvalue()
