import os
from datetime import date, datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.document import DocumentType
from app.models.user import JobGrade, JobTitle, User

FONT_REGULAR = "MalgunGothic"
FONT_BOLD = "MalgunGothic-Bold"

STAMP_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "stamp.png")
STAMP_SIZE = 20 * mm
SEAL_MARKER = "(인)"
SEAL_MARKER_EN = "(seal)"
# 직인 이미지를 찍지 않는 문서(재직증명서)에서, 대표자명과 "(인)" 사이에 오프라인 날인용으로 남겨두는 여백
OFFLINE_SEAL_GAP = "&nbsp;" * 12

_fonts_registered = False
_stamp_image: ImageReader | None = None


def _get_stamp_image() -> ImageReader | None:
    global _stamp_image
    if _stamp_image is None and os.path.exists(STAMP_PATH):
        _stamp_image = ImageReader(STAMP_PATH)
    return _stamp_image


class _StampedSignatureLine(Flowable):
    """'대표자 : 홍길동 (인)' 문구를 그리면서 '(인)' 자리에 회사 직인 이미지를 겹쳐서 찍는 flowable."""

    def __init__(self, text: str, font_name: str, font_size: int, width: float):
        super().__init__()
        self.text = text
        self.font_name = font_name
        self.font_size = font_size
        self.width = width
        self.height = max(STAMP_SIZE, font_size * 2)

    def wrap(self, available_width, available_height):
        return self.width, self.height

    def draw(self):
        canvas = self.canv
        canvas.setFont(self.font_name, self.font_size)
        text_width = canvas.stringWidth(self.text, self.font_name, self.font_size)
        start_x = (self.width - text_width) / 2
        baseline_y = self.height / 2 - self.font_size * 0.35
        canvas.drawString(start_x, baseline_y, self.text)

        stamp_image = _get_stamp_image()
        marker_index = self.text.rfind(SEAL_MARKER)
        if stamp_image is not None and marker_index != -1:
            prefix_width = canvas.stringWidth(self.text[:marker_index], self.font_name, self.font_size)
            marker_width = canvas.stringWidth(SEAL_MARKER, self.font_name, self.font_size)
            center_x = start_x + prefix_width + marker_width / 2
            center_y = self.height / 2
            canvas.drawImage(
                stamp_image,
                center_x - STAMP_SIZE / 2,
                center_y - STAMP_SIZE / 2,
                width=STAMP_SIZE,
                height=STAMP_SIZE,
                mask="auto",
            )


DOC_TITLES = {
    DocumentType.employment: "재직증명서",
    DocumentType.career: "경력증명서",
    DocumentType.employment_en: "Certificate of Employment",
}

# 경력증명서만 회사 직인을 찍는다 (재직증명서/영문 재직증명서는 직인 없이 발급).
STAMPED_DOC_TYPES = {DocumentType.career}

GRADE_LABELS = {
    JobGrade.staff: "사원",
    JobGrade.assistant_manager: "대리",
    JobGrade.manager: "과장",
    JobGrade.director: "이사",
    JobGrade.chief: "소장",
}

TITLE_LABELS = {
    JobTitle.ceo: "대표",
    JobTitle.team_lead: "팀장",
}

GRADE_LABELS_EN = {
    JobGrade.staff: "Staff",
    JobGrade.assistant_manager: "Assistant Manager",
    JobGrade.manager: "Manager",
    JobGrade.director: "Director",
    JobGrade.chief: "Chief",
}

TITLE_LABELS_EN = {
    JobTitle.ceo: "CEO",
    JobTitle.team_lead: "Team Lead",
}


def _ensure_fonts_registered() -> None:
    """Windows 기본 제공 맑은 고딕 폰트를 reportlab에 등록한다 (한글/영문 출력을 위해 필요)."""
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


def _tenure_label_en(hire_date: date, as_of: date) -> str:
    months = (as_of.year - hire_date.year) * 12 + (as_of.month - hire_date.month)
    if as_of.day < hire_date.day:
        months -= 1
    months = max(months, 0)
    years, rem_months = divmod(months, 12)

    def _plural(n: int, unit: str) -> str:
        return f"{n} {unit}{'s' if n != 1 else ''}"

    if years and rem_months:
        return f"{_plural(years, 'year')} {_plural(rem_months, 'month')}"
    if years:
        return _plural(years, "year")
    return _plural(rem_months, "month")


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
    is_en = doc_type == DocumentType.employment_en
    use_stamp = doc_type in STAMPED_DOC_TYPES

    # 재직증명서(한글/영문)는 재직기간·사업자등록번호를 표기하지 않는다. 경력증명서는 그대로 유지.
    is_career = doc_type == DocumentType.career

    if is_en:
        grade_label = GRADE_LABELS_EN.get(user.grade, "-")
        title_label = TITLE_LABELS_EN.get(user.title, "-") if user.title else "-"
        rows = [
            ["Name", user.name],
            ["Date of Birth", user.birth_date.isoformat() if user.birth_date else "-"],
            ["Address", user.address or "-"],
            ["Employee No.", user.employee_no],
            ["Grade", grade_label],
            ["Title", title_label],
            ["Date of Hire", user.hire_date.isoformat()],
            ["Purpose", purpose or "For submission"],
        ]
        certify_sentence = "This is to certify that the above-named person is currently employed at our company."
        signature_text = f"CEO: {settings.company_ceo_name or '-'}{OFFLINE_SEAL_GAP}{SEAL_MARKER_EN}"
        footer_lines = [
            f"Date Issued: {issued_date.isoformat()}",
            f"{settings.company_name}",
            signature_text,
            f"Address: {settings.company_address or '-'}",
        ]
    else:
        grade_label = GRADE_LABELS.get(user.grade, "-")
        title_label = TITLE_LABELS.get(user.title, "-") if user.title else "-"
        rows = [
            ["성 명", user.name],
            ["생년월일", user.birth_date.isoformat() if user.birth_date else "-"],
            ["주 소", user.address or "-"],
            ["사 번", user.employee_no],
            ["직 급", grade_label],
            ["직 책", title_label],
            ["입 사 일", user.hire_date.isoformat()],
        ]
        if is_career:
            rows.append(
                [
                    "재직기간",
                    f"{user.hire_date.isoformat()} ~ {issued_date.isoformat()} ({_tenure_label(user.hire_date, issued_date)})",
                ]
            )
        rows.append(["용 도", purpose or "제출용"])
        certify_sentence = (
            "위 사람은 상기 내용과 같이 재직 중임을 증명합니다."
            if doc_type == DocumentType.employment
            else "위 사람은 상기 내용과 같이 근무하였음을 증명합니다."
        )
        signature_text = f"대표자 : {settings.company_ceo_name or '-'}" + (
            f" {SEAL_MARKER}" if use_stamp else f"{OFFLINE_SEAL_GAP}{SEAL_MARKER}"
        )
        footer_lines = [
            f"발급일 : {issued_date.isoformat()}",
            f"{settings.company_name}",
            signature_text,
            f"주소 : {settings.company_address or '-'}",
        ]
        if is_career:
            footer_lines.append(f"사업자등록번호 : {settings.company_reg_no or '-'}")

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

    signature_flowable = (
        _StampedSignatureLine(signature_text, font_name=FONT_REGULAR, font_size=11, width=doc.width)
        if use_stamp
        else Paragraph(signature_text, footer_style)
    )

    # footer_lines: [발급일, 회사명, 서명(직인/여백), 주소, (경력증명서만) 사업자등록번호]
    issued_line, company_line, _signature_placeholder, *trailing_lines = footer_lines
    elements = [
        Paragraph(DOC_TITLES[doc_type], title_style),
        table,
        Spacer(1, 18 * mm),
        Paragraph(certify_sentence, footer_style),
        Spacer(1, 14 * mm),
        Paragraph(issued_line, footer_style),
        Spacer(1, 10 * mm),
        Paragraph(company_line, footer_style),
        signature_flowable,
        *[Paragraph(line, footer_style) for line in trailing_lines],
    ]

    doc.build(elements)
    return buffer.getvalue()
