from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import ApprovalRoute, ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.services.certificate_pdf import FONT_BOLD, FONT_REGULAR, SEAL_MARKER, _ensure_fonts_registered, _StampedSignatureLine

DOC_TITLES = {
    ProjectDocType.quotation: "견 적 서",
    ProjectDocType.statement: "거 래 명 세 서",
    ProjectDocType.tax_invoice: "세 금 계 산 서",
}

ROUTE_LABELS = {
    ApprovalRoute.chief: "소장 결재",
    ApprovalRoute.manager: "과장 결재",
    ApprovalRoute.self_decision: "전결",
}


def generate_project_document_pdf(doc: ProjectDocument, project: Project, client: Client | None) -> bytes:
    """견적서/거래명세서/세금계산서 PDF를 생성한다.
    결재 상태(doc.status)가 approved일 때만 결재란에 직인(투명 배경)을 찍는다 - 그 외 상태는 직인 없이 상태만 표기한다.
    """
    _ensure_fonts_registered()

    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm, leftMargin=20 * mm, rightMargin=20 * mm
    )

    title_style = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=22, alignment=1, spaceAfter=8 * mm)
    meta_style = ParagraphStyle("Meta", fontName=FONT_REGULAR, fontSize=10, alignment=1, textColor=colors.grey)
    section_style = ParagraphStyle("Section", fontName=FONT_BOLD, fontSize=11, spaceBefore=6 * mm, spaceAfter=2 * mm)
    body_style = ParagraphStyle("Body", fontName=FONT_REGULAR, fontSize=10, leading=15)
    small_style = ParagraphStyle("Small", fontName=FONT_REGULAR, fontSize=9, leading=13, textColor=colors.grey)
    footer_style = ParagraphStyle("Footer", fontName=FONT_REGULAR, fontSize=10, leading=16)

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
        ("상호", doc.client_name),
        ("대표자", (client.ceo_name if client else None) or "-"),
        ("사업자번호", (client.biz_reg_no if client else None) or "-"),
        ("담당자", doc.manager_name or "-"),
    ]

    parties = Table([[party_table(client_rows), party_table(supplier_rows)]], colWidths=[95 * mm, 95 * mm])
    parties.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (0, 0), 0.5, colors.HexColor("#e5e4e7")),
                ("BOX", (1, 0), (1, 0), 0.5, colors.HexColor("#e5e4e7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    item_header = ["내용", "수량", "단가", "금액", "비고"]
    item_rows = [item_header]
    subtotal = 0
    for item in doc.items:
        amount = item.quantity * item.unit_price
        subtotal += amount
        item_rows.append(
            [item.content, f"{item.quantity:,}", f"{item.unit_price:,}", f"{amount:,}", item.note or "-"]
        )

    items_table = Table(item_rows, colWidths=[60 * mm, 20 * mm, 30 * mm, 30 * mm, 30 * mm])
    items_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2f2f3")),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e4e7")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    vat = round(subtotal * 0.1)
    total = subtotal + vat

    totals_table = Table(
        [
            ["공급가액", f"{subtotal:,} 원"],
            ["부가세(10%)", f"{vat:,} 원"],
            ["합계", f"{total:,} 원"],
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
        Paragraph(f"발행일 : {doc.issue_date.isoformat()}", meta_style),
        Spacer(1, 8 * mm),
        Paragraph(f"프로젝트 : {project.name}", body_style),
        Spacer(1, 4 * mm),
        parties,
        Spacer(1, 8 * mm),
        Paragraph("품목 내역", section_style),
        items_table,
        Spacer(1, 4 * mm),
        totals_table,
        Spacer(1, 12 * mm),
    ]

    if doc.status == ProjectDocumentStatus.approved:
        route_label = ROUTE_LABELS.get(doc.approval_route, "") if doc.approval_route else ""
        approver_name = doc.approver.name if doc.approver else "-"
        signature_text = f"결재자 : {approver_name} ({route_label}) {SEAL_MARKER}"
        elements.append(
            _StampedSignatureLine(signature_text, font_name=FONT_REGULAR, font_size=11, width=pdf.width)
        )
        reviewed_date = doc.reviewed_at.date().isoformat() if doc.reviewed_at else "-"
        elements.append(Paragraph(f"승인일 : {reviewed_date}", footer_style))
    elif doc.status == ProjectDocumentStatus.pending:
        approver_name = doc.approver.name if doc.approver else "-"
        elements.append(Paragraph(f"[결재 대기 중 - 결재권자 : {approver_name}]", footer_style))
    elif doc.status == ProjectDocumentStatus.rejected:
        elements.append(Paragraph(f"[반려됨 - 사유 : {doc.reject_reason or '-'}]", footer_style))
    else:
        elements.append(Paragraph("[작성 중 - 결재 전]", footer_style))

    pdf.build(elements)
    return buffer.getvalue()
