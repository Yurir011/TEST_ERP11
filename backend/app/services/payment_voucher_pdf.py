from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.payment import Payment, PaymentMethod, PaymentType, ProofType
from app.services.certificate_pdf import FONT_BOLD, FONT_REGULAR, _ensure_fonts_registered

TYPE_LABELS = {PaymentType.deposit: "입금", PaymentType.withdrawal: "출금"}

METHOD_LABELS = {
    PaymentMethod.corporate_card: "법인카드",
    PaymentMethod.cash: "현금",
    PaymentMethod.bank_transfer: "계좌이체",
    PaymentMethod.other: "기타",
}

PROOF_LABELS = {
    ProofType.tax_invoice: "세금계산서",
    ProofType.expense_receipt: "지출증빙영수증",
    ProofType.simple_receipt: "간이영수증",
    ProofType.other: "기타",
}


def _esc(value: str) -> str:
    """사용자가 직접 입력한 자유 텍스트(메모/내용 등)에 &, <, > 가 있어도 reportlab Paragraph가 깨지지 않도록 이스케이프."""
    return escape(value)


def generate_payment_voucher_pdf(payment: Payment) -> bytes:
    """입출금 내역 1건을 전표 형태의 PDF 1장으로 생성한다."""
    _ensure_fonts_registered()

    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer, pagesize=A4, topMargin=25 * mm, bottomMargin=25 * mm, leftMargin=25 * mm, rightMargin=25 * mm
    )

    title_style = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=20, alignment=1, spaceAfter=4 * mm)
    company_style = ParagraphStyle("Company", fontName=FONT_REGULAR, fontSize=11, alignment=1, spaceAfter=10 * mm)
    label_style = ParagraphStyle("Label", fontName=FONT_BOLD, fontSize=11, leading=18)
    body_style = ParagraphStyle("Body", fontName=FONT_REGULAR, fontSize=11, leading=18)
    footer_style = ParagraphStyle("Footer", fontName=FONT_REGULAR, fontSize=10, alignment=1, textColor=colors.grey)

    type_label = TYPE_LABELS[payment.type]

    proof_text = "-"
    if payment.proof_type:
        if payment.proof_type == ProofType.other and payment.proof_type_detail:
            proof_text = payment.proof_type_detail
        else:
            proof_text = PROOF_LABELS[payment.proof_type]

    rows = [
        ("구 분", type_label),
        ("날 짜", payment.payment_date.isoformat()),
        ("분 류", payment.category),
        ("항 목", payment.description),
        ("거래처", payment.client.name if payment.client else "-"),
        ("결제수단", METHOD_LABELS[payment.method]),
        ("증빙발행", proof_text),
        ("금 액", f"{payment.amount:,} 원"),
        ("메 모", payment.memo or "-"),
        ("작성자", payment.creator.name if payment.creator else "-"),
    ]

    table = Table(
        [[Paragraph(_esc(k), label_style), Paragraph(_esc(str(v)), body_style)] for k, v in rows],
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

    elements = [
        Paragraph(f"{type_label} 전표", title_style),
        Paragraph(_esc(settings.company_name), company_style),
        table,
        Spacer(1, 14 * mm),
        Paragraph(f"작성일 : {payment.created_at.date().isoformat()}", footer_style),
    ]

    pdf.build(elements)
    return buffer.getvalue()
