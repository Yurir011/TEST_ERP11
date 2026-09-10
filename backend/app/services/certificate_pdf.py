import os
from datetime import date, datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.document import DocumentType
from app.models.user import User, UserRole

FONT_REGULAR = "MalgunGothic"
FONT_BOLD = "MalgunGothic-Bold"

_fonts_registered = False

DOC_TITLES = {
    DocumentType.employment: "재직증명서",
    DocumentType.career: "경력증명서",
}


def _ensure_fonts_registered() -> None:
    """Windows 기본 제공 맑은 고딕 폰트를 reportlab에 등록한다 (한글 출력을 위해 필요)."""
    global _fonts_registered
    if _fonts_registered:
        return
    windir = os.environ.get("WINDIR", "C:\\Windows")
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, os.path.join(windir, "Fonts", "malgun.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, os.path.join(windir, "Fonts", "malgunbd.ttf")))
    _fonts_registered = True


def _tenure_label(hire_date: date, as_of: date) -> str:
    months = (as_of.year - hire_date.year) * 12 + (as_of.month - hire_date.month)
    if as_of.day < hire_date.day:
        months -= 1
    months = max(months, 0)
    years, rem_months = divmod(months, 12)
    if years and rem_months:
        return f"{years}년 {rem_months}개월"
    if years:
        return f"{years}년"
    return f"{rem_months}개월"


def generate_certificate_pdf(
    user: User,
    doc_type: DocumentType,
    purpose: str | None,
    issued_at: datetime,
) -> bytes:
    _ensure_fonts_registered()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=30 * mm,
        bottomMargin=30 * mm,
        leftMargin=25 * mm,
        rightMargin=25 * mm,
    )

    title_style = ParagraphStyle(
        "Title", fontName=FONT_BOLD, fontSize=22, alignment=1, spaceAfter=20 * mm
    )
    body_style = ParagraphStyle("Body", fontName=FONT_REGULAR, fontSize=11, leading=18)
    label_style = ParagraphStyle("Label", fontName=FONT_BOLD, fontSize=11, leading=18)
    footer_style = ParagraphStyle("Footer", fontName=FONT_REGULAR, fontSize=11, alignment=1, leading=20)

    issued_date = issued_at.date()
    role_label = "관리자" if user.role == UserRole.admin else "일반직원"

    rows = [
        ["성 명", user.name],
        ["사 번", user.employee_no],
        ["부 서", user.department or "-"],
        ["구 분", role_label],
        ["입 사 일", user.hire_date.isoformat()],
    ]
    if doc_type == DocumentType.career:
        rows.append(["재직기간", f"{user.hire_date.isoformat()} ~ {issued_date.isoformat()} ({_tenure_label(user.hire_date, issued_date)})"])
    rows.append(["용 도", purpose or "제출용"])

    table = Table(
        [[Paragraph(k, label_style), Paragraph(v, body_style)] for k, v in rows],
        colWidths=[35 * mm, 110 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e4e7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    certify_sentence = (
        "위 사람은 상기 내용과 같이 재직 중임을 증명합니다."
        if doc_type == DocumentType.employment
        else "위 사람은 상기 내용과 같이 근무하였음을 증명합니다."
    )

    elements = [
        Paragraph(DOC_TITLES[doc_type], title_style),
        table,
        Spacer(1, 18 * mm),
        Paragraph(certify_sentence, footer_style),
        Spacer(1, 14 * mm),
        Paragraph(f"발급일 : {issued_date.isoformat()}", footer_style),
        Spacer(1, 10 * mm),
        Paragraph(f"{settings.company_name}", footer_style),
        Paragraph(f"대표자 : {settings.company_ceo_name or '-'} (인)", footer_style),
        Paragraph(f"주소 : {settings.company_address or '-'}", footer_style),
        Paragraph(f"사업자등록번호 : {settings.company_reg_no or '-'}", footer_style),
    ]

    doc.build(elements)
    return buffer.getvalue()
