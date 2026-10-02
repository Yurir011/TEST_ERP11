from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.proposal import Proposal, ProposalStepStatus
from app.models.user import JobTitle
from app.services.certificate_pdf import FONT_BOLD, FONT_REGULAR, _ensure_fonts_registered

CONTENT_MIN_LINES = 12  # 품의서 내용 칸 최소 줄 수

TITLE_LABELS_KO = {
    JobTitle.dept_head: "부서장",
    JobTitle.team_lead: "팀장",
    JobTitle.ceo: "대표",
}


class _BenchLogo(Flowable):
    """홈페이지 로고(원형 크로스헤어 아이콘 + BENCH 워드마크)를 벡터로 가운데 정렬해 그린다.
    아이콘은 프론트엔드 Logo.tsx가 쓰는 lucide 'Crosshair'(24x24 격자)와 같은 도형이다."""

    ICON_SIZE = 7 * mm
    FONT_SIZE = 14
    GAP = 2.5 * mm

    def __init__(self, width: float):
        super().__init__()
        self.width = width
        self.height = self.ICON_SIZE + 2 * mm

    def wrap(self, available_width, available_height):
        return self.width, self.height

    def draw(self):
        c = self.canv
        text_width = c.stringWidth("BENCH", FONT_BOLD, self.FONT_SIZE)
        total = self.ICON_SIZE + self.GAP + text_width
        x0 = (self.width - total) / 2
        y0 = (self.height - self.ICON_SIZE) / 2
        k = self.ICON_SIZE / 24

        def pt(x, y):  # lucide 좌표(좌상단 원점) -> PDF 좌표
            return x0 + x * k, y0 + (24 - y) * k

        c.saveState()
        c.setStrokeColor(colors.HexColor("#111111"))
        c.setLineWidth(2.4 * k)
        c.setLineCap(1)
        cx, cy = pt(12, 12)
        c.circle(cx, cy, 10 * k, stroke=1, fill=0)
        for (xa, ya), (xb, yb) in (((22, 12), (18, 12)), ((6, 12), (2, 12)), ((12, 6), (12, 2)), ((12, 22), (12, 18))):
            c.line(*pt(xa, ya), *pt(xb, yb))
        c.setFillColor(colors.HexColor("#111111"))
        c.setFont(FONT_BOLD, self.FONT_SIZE)
        c.drawString(x0 + self.ICON_SIZE + self.GAP, y0 + self.ICON_SIZE / 2 - self.FONT_SIZE * 0.35, "BENCH")
        c.restoreState()


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
    if proposal.is_final_decision:
        header_row.append(Paragraph("전결", label_style))
        decided = proposal.created_at.date().isoformat()
        value_row.append(Paragraph(f"{escape(proposal.creator.name)}<br/><font size=7 color='#888888'>{decided} 결재완료</font>", name_style))
    else:
        for step in proposal.steps:
            header_row.append(Paragraph(TITLE_LABELS_KO[step.title], label_style))
            if step.status == ProposalStepStatus.approved:
                decided = step.decided_at.date().isoformat() if step.decided_at else ""
                value_row.append(Paragraph(f"{escape(step.approver.name)}<br/><font size=7 color='#888888'>{decided} 결재완료</font>", name_style))
            else:
                value_row.append(Paragraph("결재대기", pending_style))

    col_count = 1 if proposal.is_final_decision else len(proposal.steps)
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
    # leading(줄 높이)을 글자 크기보다 크게 잡아야 한다. 기본값(12pt)이면 22pt 글자가 위아래 줄과 겹친다.
    title_style = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=22, leading=28, alignment=1, spaceBefore=6 * mm)
    subject_label_style = ParagraphStyle("SubjectLabel", fontName=FONT_BOLD, fontSize=10, leading=14, alignment=1)
    subject_style = ParagraphStyle("Subject", fontName=FONT_BOLD, fontSize=15, leading=20, alignment=1)
    info_label_style = ParagraphStyle("InfoLabel", fontName=FONT_BOLD, fontSize=9)
    info_value_style = ParagraphStyle("InfoValue", fontName=FONT_REGULAR, fontSize=9)
    body_style = ParagraphStyle("Body", fontName=FONT_REGULAR, fontSize=11, leading=18, spaceBefore=6 * mm)
    content_style = ParagraphStyle("Content", fontName=FONT_REGULAR, fontSize=10.5, leading=19)
    footer_style = ParagraphStyle("Footer", fontName=FONT_REGULAR, fontSize=11, alignment=1, leading=18)
    company_style = ParagraphStyle("Company", fontName=FONT_BOLD, fontSize=12, alignment=1, spaceBefore=2 * mm)

    letterhead = Paragraph(f"{settings.company_name}<br/><font size=8 color='#555555'>사내 품의 문서</font>", letterhead_style)
    approval_box = _approval_box(proposal, pdf.width)
    # 결재 도장 칸은 결재선 단계 수에 따라 너비가 달라지므로, 칸 너비를 도장 칸에 딱 맞춰 항상 오른쪽 끝에 붙인다.
    approval_box_width = sum(approval_box._colWidths)
    header = Table([[letterhead, approval_box]], colWidths=[pdf.width - approval_box_width, approval_box_width])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))

    # 제목은 종류(제목줄)와 겹치지 않도록 문서번호 표와 같은 양식의 '제 목' 칸으로 분리한다.
    subject_box = Table(
        [[Paragraph("제 목", subject_label_style), Paragraph(escape(proposal.title), subject_style)]],
        colWidths=[25 * mm, pdf.width - 25 * mm],
    )
    subject_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#111111")),
                ("LINEAFTER", (0, 0), (0, 0), 1, colors.HexColor("#111111")),
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f4f4f4")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )

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

    # 내용 칸은 내용이 짧아도 최소 12줄 높이를 확보한다 (내용이 더 길면 내용에 맞춰 늘어난다).
    content_padding_v = 14
    content_paragraph = Paragraph(_multiline(proposal.content), content_style)
    _, content_height = content_paragraph.wrap(pdf.width - 24, pdf.height)
    min_content_height = CONTENT_MIN_LINES * content_style.leading + content_padding_v * 2
    content_row_height = max(content_height + content_padding_v * 2, min_content_height)
    content_box = Table([[content_paragraph]], colWidths=[pdf.width], rowHeights=[content_row_height])
    content_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#111111")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), content_padding_v),
                ("BOTTOMPADDING", (0, 0), (-1, -1), content_padding_v),
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
        Spacer(1, 6 * mm),
        subject_box,
        Spacer(1, 3 * mm),
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
        Spacer(1, 3 * mm),
        _BenchLogo(pdf.width),
    ]

    pdf.build(elements)
    return buffer.getvalue()
