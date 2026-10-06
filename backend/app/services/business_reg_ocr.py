import re
from dataclasses import dataclass
from io import BytesIO

import pytesseract
from PIL import Image, ImageOps

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("BusinessRegOcr")

pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

MIN_DIMENSION = 1800  # 인식률을 위해 이보다 작으면 확대한다.

# 라벨 글자 사이에 끼는 잡음 허용 폭. 스캔/촬영 상태에 따라 OCR이 글자 사이에 공백뿐 아니라
# 마침표/쉼표 같은 잡음성 문자를 끼워 넣는 경우가 있고(예: "대 표 . 자"), 서식의 표 테두리 선을
# 밑줄/파이프/대괄호로 잘못 인식하는 경우도 많아(예: "대 _ 표 _ 자", "[ 업태 ]") 이런 잡음까지
# 함께 허용해야 라벨을 안정적으로 찾을 수 있다.
_SEP = r"[\s_|\[\].,·、']*"


def _spaced(label: str) -> str:
    """라벨 문자열의 각 글자 사이에 _SEP를 끼워 넣은 정규식 패턴을 만든다."""
    return _SEP.join(re.escape(ch) for ch in label)


# 뒤에 오는 값 캡처를 멈춰야 할, 사업자등록증에 흔히 등장하는 다음 라벨들.
_STOP_LABELS = "|".join(
    _spaced(l) for l in ("본점소재지", "사업장소재지", "사업의종류", "발급사유", "사업자단위")
)


@dataclass
class BusinessRegFields:
    name: str | None = None
    biz_reg_no: str | None = None
    ceo_name: str | None = None
    address: str | None = None
    biz_type: str | None = None  # 업태
    biz_class: str | None = None  # 종목
    raw_text: str = ""


def _clean(s: str) -> str:
    # 스캔 품질에 따라 OCR이 한글 글자 사이사이에 공백을 끼워 넣는 경우가 많아(예: "정 혜 란"),
    # 한글-한글 사이의 공백은 우선 제거하고, 그 외 공백은 1칸으로 정리한다.
    s = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", s)
    # 표 테두리 선이 밑줄/파이프/대괄호로 잘못 인식되어 값 안에 섞여 들어오는 경우가 많은데,
    # 실제 사업자등록증 값(상호/대표자/주소/업태·종목)에는 이런 문자가 쓰이지 않으므로 제거한다.
    s = re.sub(r"[_|\[\]]", "", s)
    return re.sub(r"\s+", " ", s).strip()


# 대표자 줄에는 같은 줄에 생년월일/개업연월일이 이어 붙는 서식이 많다 (예: "대 표 자 : 홍길동  생 년 월 일 : 1970 년 01 월 01 일").
# 이름 뒤의 라벨과 날짜가 대표자명에 섞여 들어오지 않도록 라벨 또는 첫 숫자에서 잘라낸다.
_CEO_STOP = re.compile(
    "|".join([_spaced("생년월일"), _spaced("개업연월일"), _spaced("연월일"), _spaced("생년"), _spaced("주민"), _spaced("법인등록번호"), r"\d"])
)


def _clean_ceo(value: str) -> str | None:
    value = _CEO_STOP.split(value, maxsplit=1)[0]
    value = _clean(value)
    # 이름에는 한글/영문만 쓰이므로 끝에 남은 기호(콜론, 괄호 등)를 정리한다.
    value = re.sub(r"[^가-힣A-Za-z\s]+$", "", value).strip()
    return value or None


def _preprocess(image_bytes: bytes) -> Image.Image:
    image = Image.open(BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)  # 휴대폰 촬영 시 회전 메타데이터 보정
    image = image.convert("L")  # 그레이스케일
    if max(image.size) < MIN_DIMENSION:
        scale = MIN_DIMENSION / max(image.size)
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)
    image = ImageOps.autocontrast(image, cutoff=1)
    return image


def _line_after(text: str, anchor_pattern: str) -> str | None:
    """anchor_pattern이 등장하는 줄 바로 다음의 (비어있지 않은) 줄 내용을 반환한다.
    사업자등록증은 항상 같은 서식이라 "라벨 글자 자체"가 OCR로 깨지더라도,
    바로 이웃한 라벨(법인명 등)은 비교적 잘 인식되므로 그 위치를 기준으로 값을 찾는 보조 수단이다."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if re.search(anchor_pattern, line):
            for j in range(i + 1, len(lines)):
                candidate = lines[j].strip()
                if candidate:
                    return candidate
    return None


def _line_after_address_block(text: str, start_anchor_pattern: str) -> str | None:
    """주소는 괄호로 끝나는 동/건물명까지 줄바꿈되며 이어지므로, start_anchor_pattern이 등장한 줄부터
    닫는 괄호가 나오는 줄까지를 주소 블록으로 보고, 그 다음(비어있지 않은) 줄을 반환한다."""
    lines = text.splitlines()
    started = False
    for i, line in enumerate(lines):
        if not started:
            if re.search(start_anchor_pattern, line):
                started = True
            continue
        if ")" in line or "）" in line:
            for j in range(i + 1, len(lines)):
                candidate = lines[j].strip()
                if candidate:
                    return candidate
            return None
    return None


def _strip_leading_noise(s: str) -> str:
    """OCR이 콜론(:) 등을 다른 기호로 잘못 읽는 경우가 많아, 맨 앞의 기호성 문자를 제거한다."""
    return re.sub(r"^[^가-힣A-Za-z0-9]+", "", s).strip()


def _extract_fields(text: str) -> BusinessRegFields:
    fields = BusinessRegFields(raw_text=text)

    m = re.search(r"\d{3}\s*-\s*\d{2}\s*-\s*\d{5}", text)
    if m:
        fields.biz_reg_no = re.sub(r"\s+", "", m.group())

    name_label_pattern = rf"{_spaced('법인명')}{_SEP}\(?{_SEP}{_spaced('단체명')}{_SEP}\)?|{_spaced('상호')}"
    m = re.search(rf"(?:{name_label_pattern}){_SEP}[:：]?{_SEP}(.+)", text)
    if m:
        name = re.split(r"[(（]", m.group(1))[0]  # 괄호 안 영문 표기 제거
        fields.name = _clean(name) or None

    ceo_label_pattern = _spaced("대표자")
    m = re.search(rf"{ceo_label_pattern}{_SEP}[:：)]?{_SEP}(.+)", text)
    if m:
        fields.ceo_name = _clean_ceo(m.group(1))
    else:
        # "대표자" 라벨 자체가 오인식된 경우 - 법인명 다음 줄이 항상 대표자이므로 그 값을 사용한다.
        fallback = _line_after(text, name_label_pattern)
        if fallback:
            fallback = re.sub(rf"^{_SEP}{ceo_label_pattern}{_SEP}[:：)]?{_SEP}", "", fallback)
            fields.ceo_name = _clean_ceo(_strip_leading_noise(fallback))

    head_office_pattern = _spaced("본점소재지")
    biz_office_pattern = _spaced("사업장소재지")
    addr_pattern = rf"{head_office_pattern}{_SEP}[:：]?{_SEP}(.+?)(?={_STOP_LABELS}|$)"
    m = re.search(addr_pattern, text, re.S)
    if not m:
        addr_pattern = rf"{biz_office_pattern}{_SEP}[:：]?{_SEP}(.+?)(?={_STOP_LABELS}|$)"
        m = re.search(addr_pattern, text, re.S)
    if m:
        fields.address = _clean(m.group(1)) or None

    # "업태"는 자획이 비슷한 "엄태/업대/엄대" 등으로, "종목"은 "총목/종록/총록" 등으로 자주
    # 오인식되므로 첫/끝 글자를 유사 글자와 함께 허용한다.
    biz_type_label = rf"[업엄]{_SEP}[태대]"
    biz_item_label = rf"[종총]{_SEP}[목록]"
    m = re.search(rf"{biz_type_label}{_SEP}[:：]?{_SEP}(.+?){_SEP}{biz_item_label}{_SEP}[:：]?{_SEP}([^\n]+)", text)
    if m:
        fields.biz_type = _clean(m.group(1)) or None
        fields.biz_class = _clean(m.group(2)) or None
    else:
        # "업태"/"종목" 라벨 자체가 오인식된 경우 - 본점소재지 주소 블록(괄호로 끝남) 바로 다음 줄이
        # 항상 "사업의 종류" 행이므로 그 값을 사용한다. "사업의종류" 라벨이 살아있으면 앞부분만 제거한다.
        # 업태/종목 경계를 안정적으로 구분할 수 없어 전체를 업태에 넣고, 종목은 사용자가 직접 채우게 한다.
        fallback = _line_after_address_block(text, head_office_pattern)
        if fallback:
            fallback = re.sub(rf"^.*?{_spaced('사업의종류')}{_SEP}[:：]?{_SEP}", "", fallback)
            # 값 중간에 섞여 있는 "업태"/"종목" 라벨(오인식 포함)도 값이 아니므로 제거한다.
            fallback = re.sub(rf"{biz_type_label}{_SEP}[:：]?", "", fallback)
            fallback = re.sub(rf"{biz_item_label}{_SEP}[:：]?", "", fallback)
            fields.biz_type = _clean(_strip_leading_noise(fallback)) or None

    return fields


def recognize_business_registration(image_bytes: bytes) -> BusinessRegFields:
    """사업자등록증 이미지에서 텍스트를 인식하고 주요 항목을 정규식으로 추출한다.
    로컬 Tesseract OCR을 사용하므로 인식 결과가 완벽하지 않을 수 있어, 호출 측에서 반드시 사용자 확인을 거쳐야 한다."""
    image = _preprocess(image_bytes)
    # 사업자등록증은 대표자명 등 대부분이 한글이라, kor+eng로 인식하면 흐릿한 부분을 영문으로
    # 잘못 판단해 엉뚱한 알파벳으로 읽는 경우가 많다(예: "대"->"cH"). 한글 전용으로 강제한다.
    text = pytesseract.image_to_string(image, lang="kor", config="--psm 6")
    logger.debug(f"[BusinessRegOcr] OCR 인식 완료: text_len={len(text)}")
    return _extract_fields(text)
