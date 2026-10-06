import re
from dataclasses import dataclass
from io import BytesIO

import pytesseract
from PIL import Image, ImageOps

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("BankbookOcr")

pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

MIN_DIMENSION = 1800  # 인식률을 위해 이보다 작으면 확대한다.

# 라벨/은행명 글자 사이에 OCR이 끼워 넣는 공백·표 테두리 잡음을 허용한다 (business_reg_ocr와 같은 이유).
_SEP = r"[\s_|\[\].,·']*"


def _spaced(label: str) -> str:
    return _SEP.join(re.escape(ch) for ch in label)


# (표시할 은행명, 인식에 쓸 후보 문자열들). 앞에 있는 후보일수록 확실한 표기라 먼저 찾는다.
# "우리"/"하나"처럼 일반 단어와 겹치는 이름은 반드시 "은행"까지 붙은 형태만 인정해 오인식을 막는다.
BANKS: list[tuple[str, list[str]]] = [
    ("KB국민은행", ["국민은행", "KB국민", "KB Kookmin"]),
    ("신한은행", ["신한은행", "Shinhan"]),
    ("우리은행", ["우리은행", "Woori"]),
    ("하나은행", ["하나은행", "KEB하나", "Hana Bank"]),
    ("IBK기업은행", ["기업은행", "IBK"]),
    ("NH농협은행", ["농협은행", "NH농협", "농협", "NH"]),
    ("카카오뱅크", ["카카오뱅크", "kakaobank"]),
    ("케이뱅크", ["케이뱅크", "Kbank"]),
    ("토스뱅크", ["토스뱅크"]),
    ("SC제일은행", ["SC제일", "제일은행"]),
    ("한국씨티은행", ["씨티은행", "시티은행", "Citibank"]),
    ("KDB산업은행", ["산업은행"]),
    ("수협은행", ["수협은행", "수협"]),
    ("iM뱅크(대구은행)", ["대구은행", "iM뱅크"]),
    ("부산은행", ["부산은행"]),
    ("경남은행", ["경남은행"]),
    ("광주은행", ["광주은행"]),
    ("전북은행", ["전북은행"]),
    ("제주은행", ["제주은행"]),
    ("우체국", ["우체국"]),
    ("새마을금고", ["새마을금고", "MG새마을"]),
    ("신협", ["신협", "신용협동조합"]),
    ("산림조합", ["산림조합"]),
]


@dataclass
class BankbookFields:
    bank_name: str | None = None
    bank_account: str | None = None
    holder: str | None = None  # 예금주
    raw_text: str = ""


def _preprocess(image_bytes: bytes) -> Image.Image:
    image = Image.open(BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)  # 휴대폰 촬영 시 회전 메타데이터 보정
    image = image.convert("L")
    if max(image.size) < MIN_DIMENSION:
        scale = MIN_DIMENSION / max(image.size)
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)
    return ImageOps.autocontrast(image, cutoff=1)


def _find_bank(text: str) -> str | None:
    for display, candidates in BANKS:
        for cand in candidates:
            if re.search(_spaced(cand), text, re.IGNORECASE):
                return display
    return None


# 하이픈(또는 공백)으로 끊긴 계좌번호 (예: 110-123-456789, 1002-123-456789) 또는 붙어 있는 10~16자리 숫자.
_ACCOUNT_HYPHEN = re.compile(r"(?<![\d-])(\d{2,6})\s?[-–—]\s?(\d{2,8})(?:\s?[-–—]\s?(\d{2,8}))?(?:\s?[-–—]\s?(\d{1,8}))?(?![\d-])")
_ACCOUNT_PLAIN = re.compile(r"(?<!\d)\d{10,16}(?!\d)")
# 사업자등록번호(3-2-5)/전화번호처럼 계좌번호가 아닌 숫자열을 걸러낸다.
_BIZ_REG = re.compile(r"^\d{3}-\d{2}-\d{5}$")
_PHONE = re.compile(r"^(0\d{1,2})-\d{3,4}-\d{4}$")


def _find_account(text: str) -> str | None:
    best: tuple[int, str] | None = None
    for line in text.splitlines():
        has_label = bool(re.search(_spaced("계좌") + "|" + _spaced("번호"), line))
        candidates = [m.group(0) for m in _ACCOUNT_HYPHEN.finditer(line)] + [m.group(0) for m in _ACCOUNT_PLAIN.finditer(line)]
        for raw in candidates:
            cand = re.sub(r"\s*[-–—]\s*", "-", raw).strip()
            digits = re.sub(r"\D", "", cand)
            if _BIZ_REG.match(cand) or _PHONE.match(cand) or not (9 <= len(digits) <= 16):
                continue
            # 점수: 계좌 라벨이 있는 줄 > 하이픈이 있는 표기 > 자릿수가 일반적인 범위(11~14)
            score = (100 if has_label else 0) + (10 if "-" in cand else 0) + (5 if 11 <= len(digits) <= 14 else 0)
            if best is None or score > best[0]:
                best = (score, cand)
    return best[1] if best else None


def _find_holder(text: str) -> str | None:
    m = re.search(rf"{_spaced('예금주')}{_SEP}[:：]?{_SEP}([^\n]+)", text)
    if not m:
        return None
    value = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", m.group(1))  # 한글 사이 공백 제거
    value = re.sub(r"[_|\[\]]", "", value)
    value = re.sub(r"^[^가-힣A-Za-z(]+", "", value)
    value = re.sub(r"\(\s+", "(", value)
    value = re.sub(r"\s+\)", ")", value)  # "( 주 )" -> "(주)"
    return re.sub(r"\s+", " ", value).strip() or None


def _extract_fields(text: str) -> BankbookFields:
    return BankbookFields(
        bank_name=_find_bank(text), bank_account=_find_account(text), holder=_find_holder(text), raw_text=text
    )


def recognize_bankbook(image_bytes: bytes) -> BankbookFields:
    """통장사본(통장 표지, 앱 캡처, 스캔 등) 이미지에서 은행명/계좌번호/예금주를 추출한다.
    통장 서식이 은행마다 달라 로컬 Tesseract로는 완벽하지 않으므로 호출 측에서 반드시 사용자 확인을 거쳐야 한다."""
    image = _preprocess(image_bytes)
    # 서로 다른 레이아웃 가정(단일 블록/자동 분할)으로 두 번 읽어 합친 뒤 추출한다. 한 쪽에서 놓친 항목을 다른 쪽이 잡는 경우가 많다.
    texts = [
        pytesseract.image_to_string(image, lang="kor+eng", config="--psm 6"),
        pytesseract.image_to_string(image, lang="kor+eng", config="--psm 4"),
        # 큰 로고 글씨(예: "NH농협은행")는 영문+한글 혼합이라 위 두 번에서 깨지기 쉬워, 한글 전용/흩어진 글자 모드로 한 번씩 더 읽는다.
        pytesseract.image_to_string(image, lang="kor", config="--psm 6"),
        pytesseract.image_to_string(image, lang="kor+eng", config="--psm 11"),
    ]
    combined = "\n".join(texts)
    fields = _extract_fields(combined)
    logger.debug(
        f"[BankbookOcr] 인식 완료: bank={fields.bank_name}, account={fields.bank_account}, holder={fields.holder}, text_len={len(combined)}"
    )
    return fields
