from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.proposal import Proposal, ProposalStepStatus
from app.models.user import JobTitle
from app.services.certificate_pdf import FONT_BOLD, FONT_REGULAR, _ensure_fonts_registered

TITLE_LABELS_KO = {
    JobTitle.dept_head: "부서장",
    JobTitle.team_lead: "팀장",
    JobTitle.ceo: "대표",
}


def _doc_title(proposal: Proposal) -> str:
    return f"{proposal.kind}품의서" if proposal.kind else "품의서"


def _multiline(text: str) -> str:
    return escape(text).replace("\n", "<br/>")


def _approval_box(proposal: Proposal, width: float) -> Table:
    label_style = ParagraphStyle("StepLabel", fontName=FONT_BOLD, fontSize=10, alignment=1)
    name_style = ParagraphStyle("StepName", fontName=FONT_BOLD, fontSize=10.5, alignment=1, textColor=colors.HexColor("#1d4ed8"))
    stamp_style = ParagraphStyle("StepStamp", fontName=FONT_REGULAR, fontSize=7.5, alignment=1, textColor=colors.HexColor("#888888"))
    pending_style = ParagraphStyle("StepPending", fontName=FONT_REGULAR, fontSize=8.5, alignment=1, textColor=colors.HexColor("#aaaaaa"))
    corner_style = ParagraphStyle("Corner", fontName=FONT_REGULAR, fontSize=9, alignment=1, leading=11)

    header_row = [Paragraph("결<br/>재", corner_style)]
    value_row = [""]
    for step in proposal.steps:
        header_row.append(Paragraph(TITLE_LABELS_KO[step.title], label_style))
        if step.status == ProposalStepStatus.approved:
            decided = step.decided_at.date().isoformat() if step.decided_at else ""
            value_row.append(Paragraph(f"{escape(step.approver.name)}<br/><font size=7 color='#888888'>{decided} 결재완료</font>", name_style))
        else:
            value_row.append(Paragraph("결재대기", pending_style))

    col_count = len(proposal.steps)
    col_width = 20 * mm
    corner_width = 9 * mm
    table = Table([header_row, value_row], colWidths=[corner_width] + [col_width] * col_count, rowHeights=[7 * mm, 16 * mm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#111111")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("SPAN", (0, 0), (0, 1)),
                ("BACKGROUND", (1, 0), (-1, 0), colors.HexColor("#f4f4f4")),
            ]
        )
    )
    table.hAlign = "RIGHT"
    return table


def generate_proposal_pdf(proposal: Proposal) -> bytes:
    """품의서 PDF를 생성한다. 결재 완료된 단계는 이름+'결재완료' 표시가 자동으로 찍히고,
    이후 개인 도장 이미지가 등록되면 이 자리에 실제 직인이 찍히도록 확장할 수 있다."""
    _ensure_fonts_registered()

    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=20 * mm, rightMargin=20 * mm
    )

    letterhead_style = ParagraphStyle("Letterhead", fontName=FONT_BOLD, fontSize=13, leading=16)
    letterhead_sub_style = ParagraphStyle("LetterheadSub", fontName=FONT_REGULAR, fontSize=8, textColor=colors.HexColor("#555555"))
    title_style = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=22, alignment=1, spaceBefore=6 * mm)
    subject_style = ParagraphStyle("Subject", fontName=FONT_BOLD, fontSize=13, alignment=1, spaceBefore=3 * mm)
    info_label_style = ParagraphStyle("InfoLabel", fontName=FONT_BOLD, fontSize=9)
    info_value_style = ParagraphStyle("InfoValue", fontName=FONT_REGULAR, fontSize=9)
    body_style = ParagraphStyle("Body", fontName=FONT_REGULAR, fontSize=11, leading=18, spaceBefore=6 * mm)
    content_style = ParagraphStyle("Content", fontName=FONT_REGULAR, fontSize=10.5, leading=19)
    footer_style = ParagraphStyle("Footer", fontName=FONT_REGULAR, fontSize=11, alignment=1, leading=18)
    company_style = ParagraphStyle("Company", fontName=FONT_BOLD, fontSize=12, alignment=1, spaceBefore=2 * mm)

    letterhead = Paragraph(f"{settings.company_name}<br/><font size=8 color='#555555'>사내 품의 문서</font>", letterhead_style)
    header = Table([[letterhead, _approval_box(proposal, pdf.width)]], colWidths=[pdf.width - 96 * mm, 96 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    info_rows = [
        ["문서번호", proposal.doc_no, "기안일자", proposal.issue_date.isoformat()],
        ["기안자", proposal.creator.name, "기안부서", proposal.department_name],
    ]
    info_table = Table(
        [[Paragraph(c, info_label_style if i % 2 == 0 else info_value_style) for i, c in enumerate(row)] for row in info_rows],
        colWidths=[25 * mm, 60 * mm, 25 * mm, 60 * mm],
    )
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f4f4f4")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f4f4f4")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#111111")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    content_box = Table([[Paragraph(_multiline(proposal.content), content_style)]], colWidths=[pdf.width])
    content_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#111111")),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )

    attachment_style = ParagraphStyle("Attachment", fontName=FONT_REGULAR, fontSize=9.5, leading=15, spaceBefore=4 * mm)
    attachment_lines = [
        f"{idx + 1}. {escape(a.label)}" for idx, a in enumerate(proposal.attachments)
    ]
    attachment_block = (
        [Paragraph("붙임 " + " &nbsp;&nbsp; ".join(attachment_lines), attachment_style)]
        if attachment_lines
        else []
    )

    elements = [
        header,
        Paragraph(_doc_title(proposal), title_style),
        Paragraph(escape(proposal.title), subject_style),
        Spacer(1, 8 * mm),
        info_table,
        Paragraph(f"1. 아래와 같이 {escape(proposal.topic)}을 진행하고자 하오니 검토하여 승인해 주십시오.", body_style),
        Spacer(1, 4 * mm),
        content_box,
        *attachment_block,
        Spacer(1, 10 * mm),
        Paragraph("위와 같이 품의합니다.", footer_style),
        Spacer(1, 6 * mm),
        Paragraph(f"{proposal.issue_date.year}년 {proposal.issue_date.month}월 {proposal.issue_date.day}일", footer_style),
        Paragraph(settings.company_name, company_style),
    ]

    pdf.build(elements)
    return buffer.getvalue()
