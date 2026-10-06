import re
from dataclasses import dataclass, field
from datetime import date
from io import BytesIO

import pytesseract
from PIL import Image, ImageOps

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("TaxInvoiceOcr")

pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

# 홈택스에서 인쇄/저장한 전자세금계산서(A4 가로, 표준 서식) 이미지를 기준으로 한 칸별 좌표.
# 기준 이미지 크기(1586x1191)에 맞춰 잰 픽셀 좌표이며, 실제 이미지는 이 크기로 맞춘 뒤 잘라서 인식한다.
# 서식이 고정이라 전체 페이지를 한 번에 OCR하는 것보다 칸 단위로 인식하는 편이 훨씬 정확하다.
REF_W, REF_H = 1586, 1191

BOX_APPROVAL_NO = (975, 85, 1510, 145)
BOX_SUPPLIER_REG_NO = (255, 150, 505, 203)
BOX_SUPPLIER_NAME = (255, 207, 505, 262)
BOX_SUPPLIER_CEO = (612, 207, 790, 262)
BOX_SUPPLIER_ADDRESS = (255, 265, 790, 322)
BOX_SUPPLIER_BIZ_TYPE = (255, 325, 395, 376)
BOX_SUPPLIER_BIZ_CLASS = (505, 325, 790, 376)
BOX_SUPPLIER_EMAIL = (255, 380, 790, 462)
BOX_RECIPIENT_REG_NO = (975, 150, 1225, 203)
BOX_RECIPIENT_NAME = (975, 207, 1225, 262)
BOX_RECIPIENT_CEO = (1333, 207, 1508, 262)
BOX_RECIPIENT_ADDRESS = (975, 265, 1508, 322)
BOX_RECIPIENT_BIZ_TYPE = (975, 325, 1115, 376)
BOX_RECIPIENT_BIZ_CLASS = (1226, 325, 1508, 376)
BOX_RECIPIENT_EMAIL = (975, 378, 1508, 420)
BOX_ISSUE_DATE = (75, 515, 250, 567)
BOX_SUPPLY_TOTAL = (255, 515, 520, 567)
BOX_VAT_TOTAL = (525, 515, 790, 567)
BOX_GRAND_TOTAL = (75, 888, 318, 942)

ITEM_ROW_TOPS = (615, 672, 729, 786)
ITEM_ROW_HEIGHT = 55
ITEM_COLS = {
    "month": (75, 125),
    "day": (128, 180),
    "content": (182, 540),
    "spec": (543, 665),
    "quantity": (668, 790),
    "unit_price": (793, 970),
    "supply": (973, 1186),
    "vat": (1188, 1365),
}

_REG_NO = re.compile(r"(\d{3})-?(\d{2})-?(\d{5})")


@dataclass
class TaxInvoiceParty:
    reg_no: str | None = None
    name: str | None = None
    ceo_name: str | None = None
    address: str | None = None
    biz_type: str | None = None  # 업태
    biz_class: str | None = None  # 종목
    email: str | None = None


@dataclass
class TaxInvoiceOcrItem:
    content: str
    spec: str | None
    quantity: float
    unit_price: float
    supply_amount: int
    vat_amount: int


@dataclass
class TaxInvoiceOcrResult:
    approval_no: str | None = None
    issue_date: date | None = None
    supplier: TaxInvoiceParty = field(default_factory=TaxInvoiceParty)
    recipient: TaxInvoiceParty = field(default_factory=TaxInvoiceParty)
    supply_amount: int | None = None
    vat_amount: int | None = None
    total_amount: int | None = None
    items: list[TaxInvoiceOcrItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _prepare(image_bytes: bytes) -> Image.Image:
    image = Image.open(BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("L")
    return image.resize((REF_W, REF_H), Image.LANCZOS)


def _crop(image: Image.Image, box: tuple[int, int, int, int], binarize: bool = False) -> Image.Image:
    x0, y0, x1, y1 = box
    c = image.crop((x0 + 3, y0 + 3, x1 - 3, y1 - 3))  # 표 테두리 선이 글자로 잡히지 않도록 안쪽으로 줄인다.
    c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
    c = ImageOps.autocontrast(c, cutoff=1)
    if binarize:
        # 한글 칸은 흑백으로 또렷하게 만들면 비슷한 글자(제/세, 통/동)를 훨씬 덜 헷갈린다.
        c = c.point(lambda v: 255 if v > 150 else 0)
    return c


def _ocr(
    image: Image.Image, box: tuple[int, int, int, int], lang: str, psm: int = 7, whitelist: str | None = None, binarize: bool = False
) -> str:
    config = f"--psm {psm}"
    if whitelist:
        config += f" -c tessedit_char_whitelist={whitelist}"
    return pytesseract.image_to_string(_crop(image, box, binarize), lang=lang, config=config).strip()


def _num_text(image, box) -> str:
    return _ocr(image, box, "eng", whitelist="0123456789-,.")


def _hangul(image, box, psm: int = 7) -> str | None:
    text = _ocr(image, box, "kor", psm, binarize=True)
    # OCR이 한글 글자 사이에 공백을 끼우는 경우가 있어 한글-한글 사이 공백은 제거한다. 표 테두리 잡음도 제거.
    text = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", text)
    text = re.sub(r"[_|\[\]]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return _tidy_punctuation(text) or None


def _tidy_punctuation(text: str) -> str:
    """OCR이 괄호/쉼표 주변에 끼워 넣는 공백을 정리한다 (예: "( 용산동 )" -> "(용산동)", "통신장비 , 전자" -> "통신장비, 전자")."""
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return re.sub(r"\s+,", ",", text)


def _company_name(image, box) -> str | None:
    """상호: 한글 사이 공백 제거 때문에 붙어버린 법인 형태를 다시 띄운다 (예: "주식회사수젠텍" -> "주식회사 수젠텍")."""
    name = _hangul(image, box)
    return re.sub(r"^(주식회사|유한회사|유한책임회사|합자회사|합명회사)(?=\S)", lambda m: m.group(1) + " ", name) if name else name


def _address(image, box) -> str | None:
    """주소는 한글/숫자/영문/괄호/쉼표가 섞여 있어 kor+eng로 읽고, 한글 사이 공백만 정리한다."""
    text = _ocr(image, box, "kor", psm=6, binarize=True)
    text = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", text)
    text = re.sub(r"[_|\[\]]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return _tidy_punctuation(text) or None


def _email(image, box) -> str | None:
    text = _ocr(image, box, "eng", whitelist="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ@._-")
    m = re.search(r"[\w.\-]+@[\w\-]+(?:\.[\w\-]+)+", text)
    return m.group(0) if m else None


def _reg_no(image, box) -> str | None:
    m = _REG_NO.search(_num_text(image, box))
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _to_int(text: str) -> int | None:
    digits = re.sub(r"[^\d]", "", text.split(".")[0])
    return int(digits) if digits else None


def _to_float(text: str) -> float | None:
    cleaned = re.sub(r"[^\d.]", "", text)
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _parse_date(text: str) -> date | None:
    m = re.search(r"(\d{4})-?(\d{2})-?(\d{2})", text)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _read_items(image: Image.Image) -> list[TaxInvoiceOcrItem]:
    items: list[TaxInvoiceOcrItem] = []
    for top in ITEM_ROW_TOPS:
        def box(col: str) -> tuple[int, int, int, int]:
            x0, x1 = ITEM_COLS[col]
            return (x0, top, x1, top + ITEM_ROW_HEIGHT)

        supply = _to_int(_num_text(image, box("supply")))
        if supply is None:  # 빈 줄
            continue
        content = _ocr(image, box("content"), "kor+eng")
        content = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", content).strip()
        spec = _ocr(image, box("spec"), "kor+eng", psm=6)
        spec = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", spec)
        spec = re.sub(r"\s+", " ", spec).strip() or None
        quantity = _to_float(_num_text(image, box("quantity"))) or 1
        unit_price = _to_float(_num_text(image, box("unit_price"))) or float(supply)
        vat = _to_int(_num_text(image, box("vat"))) or 0
        items.append(
            TaxInvoiceOcrItem(
                content=content or "(품목 인식 실패)",
                spec=spec,
                quantity=quantity,
                unit_price=unit_price,
                supply_amount=supply,
                vat_amount=vat,
            )
        )
    return items


def recognize_tax_invoice(image_bytes: bytes) -> TaxInvoiceOcrResult:
    """홈택스 전자세금계산서 이미지에서 주요 항목을 칸 단위로 인식한다.
    로컬 Tesseract OCR이라 완벽하지 않으므로 호출 측에서 반드시 사용자 확인을 거쳐야 하고,
    금액 합계가 맞지 않는 등 의심스러운 부분은 warnings에 담아 돌려준다."""
    image = _prepare(image_bytes)
    r = TaxInvoiceOcrResult()

    approval = _ocr(image, BOX_APPROVAL_NO, "eng", whitelist="0123456789-abcdefghijklmnopqrstuvwxyz")
    m = re.search(r"\d{8}-\d{8}-[0-9a-z]{8}", approval)
    r.approval_no = m.group(0) if m else (approval or None)

    r.supplier = TaxInvoiceParty(
        reg_no=_reg_no(image, BOX_SUPPLIER_REG_NO),
        name=_company_name(image, BOX_SUPPLIER_NAME),
        ceo_name=_hangul(image, BOX_SUPPLIER_CEO),
        address=_address(image, BOX_SUPPLIER_ADDRESS),
        biz_type=_hangul(image, BOX_SUPPLIER_BIZ_TYPE),
        biz_class=_hangul(image, BOX_SUPPLIER_BIZ_CLASS),
        email=_email(image, BOX_SUPPLIER_EMAIL),
    )
    r.recipient = TaxInvoiceParty(
        reg_no=_reg_no(image, BOX_RECIPIENT_REG_NO),
        name=_company_name(image, BOX_RECIPIENT_NAME),
        ceo_name=_hangul(image, BOX_RECIPIENT_CEO),
        address=_address(image, BOX_RECIPIENT_ADDRESS),
        biz_type=_hangul(image, BOX_RECIPIENT_BIZ_TYPE),
        biz_class=_hangul(image, BOX_RECIPIENT_BIZ_CLASS),
        email=_email(image, BOX_RECIPIENT_EMAIL),
    )

    r.issue_date = _parse_date(_num_text(image, BOX_ISSUE_DATE))
    r.supply_amount = _to_int(_num_text(image, BOX_SUPPLY_TOTAL))
    r.vat_amount = _to_int(_num_text(image, BOX_VAT_TOTAL))
    r.total_amount = _to_int(_num_text(image, BOX_GRAND_TOTAL))
    r.items = _read_items(image)

    if r.issue_date is None:
        r.warnings.append("작성일자를 읽지 못했습니다.")
    if not r.supplier.reg_no or not r.recipient.reg_no:
        r.warnings.append("공급자/공급받는자 등록번호를 읽지 못했습니다. 홈택스에서 저장한 원본 서식이 맞는지 확인해주세요.")
    if r.supply_amount is None or not r.items:
        r.warnings.append("금액/품목을 읽지 못했습니다. 직접 입력해주세요.")
    elif r.vat_amount is not None and r.total_amount is not None and r.supply_amount + r.vat_amount != r.total_amount:
        r.warnings.append("공급가액+세액이 합계금액과 맞지 않습니다. 금액을 확인해주세요.")
    elif sum(i.supply_amount for i in r.items) != r.supply_amount:
        r.warnings.append("품목별 공급가액의 합이 공급가액과 맞지 않습니다. 품목을 확인해주세요.")

    logger.debug(
        f"[TaxInvoiceOcr] 인식 완료: approval_no={r.approval_no}, supplier={r.supplier.reg_no}, "
        f"recipient={r.recipient.reg_no}, supply={r.supply_amount}, items={len(r.items)}, warnings={len(r.warnings)}"
    )
    return r
