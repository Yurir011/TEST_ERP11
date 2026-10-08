"""국세청 홈택스 "전자세금계산서 목록 조회" 엑셀을 읽어 매입매출 입력용 행으로 바꾸는 파서.

열 위치가 아니라 머리글 이름으로 열을 찾으므로, 홈택스에서 열 순서가 조금 달라져도 읽을 수 있다.
"""
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from app.logging_config import get_logger

logger = get_logger("HometaxImport")


class HometaxParseError(Exception):
    pass


# 머리글(공백/줄바꿈/괄호/슬래시 제거 후) → 내부 필드 이름
_ALIASES: dict[str, str] = {
    "승인번호": "approval_no",
    "작성일자": "write_date",
    "발급일자": "issue_date",
    "합계금액": "total",
    "공급가액": "supply",
    "세액": "vat",
    "품목명": "item_name",
    "품목수량": "item_qty",
    "품목단가": "item_price",
    "품목공급가액": "item_supply",
    "품목세액": "item_vat",
    "영수청구구분": "purpose",
    "비고": "note",
}

# 공급자/공급받는자 영역의 열. 홈택스 엑셀은 "사업자등록번호, 종사업장번호, 상호, 대표자명, 주소"가 공급자 → 공급받는자
# 순서로 반복되고(그 뒤 수탁사업자 영역에도 한 번 더 나온다), 머리글에 "공급자"/"공급받는자"가 붙어 있기도 하다.
_PARTY_BASES: dict[str, str] = {
    "사업자등록번호": "reg",
    "사업자번호": "reg",
    "상호": "name",
    "대표자명": "ceo",
    "대표자": "ceo",
    "주소": "addr",
}


@dataclass
class HometaxItem:
    name: str
    quantity: float | None
    unit_price: float | None
    supply: int | None
    vat: int | None


@dataclass
class HometaxInvoice:
    approval_no: str
    write_date: date | None
    supplier_reg: str
    supplier_name: str
    supplier_ceo: str
    supplier_addr: str
    buyer_reg: str
    buyer_name: str
    buyer_ceo: str
    buyer_addr: str
    supply: int | None
    vat: int | None
    total: int | None
    purpose: str = ""  # 영수 / 청구
    items: list[HometaxItem] = field(default_factory=list)

    @property
    def item_names(self) -> list[str]:
        return [i.name for i in self.items if i.name]


def _norm(value) -> str:
    return re.sub(r"[\s()/]", "", str(value)) if value is not None else ""


def digits_only(value) -> str:
    return re.sub(r"\D", "", str(value)) if value is not None else ""


def format_reg_no(digits: str) -> str:
    return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}" if len(digits) == 10 else digits


def is_valid_reg_no(digits: str) -> bool:
    """사업자등록번호 검증(마지막 자리 검증번호 계산)."""
    if len(digits) != 10 or not digits.isdigit():
        return False
    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    nums = [int(c) for c in digits]
    total = sum(n * w for n, w in zip(nums[:9], weights))
    total += (nums[8] * 5) // 10
    return (10 - total % 10) % 10 == nums[9]


def _to_int(value) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(round(float(str(value).replace(",", "").strip())))
    except ValueError:
        return None


def _to_float(value) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def _to_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip() if value is not None else ""
    m = re.match(r"^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})", text)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _read_rows(raw: bytes, filename: str) -> list[list]:
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
        ws = wb.worksheets[0]
        return [list(r) for r in ws.iter_rows(values_only=True)]
    if name.endswith(".xls"):
        import xlrd

        try:
            book = xlrd.open_workbook(file_contents=raw)
        except Exception as exc:
            raise HometaxParseError(
                "이 .xls 파일을 읽지 못했습니다. 엑셀에서 열어 '.xlsx'로 다시 저장한 뒤 올려주세요."
            ) from exc
        sheet = book.sheet_by_index(0)
        return [sheet.row_values(i) for i in range(sheet.nrows)]
    raise HometaxParseError("엑셀 파일(.xlsx 또는 .xls)만 올릴 수 있습니다.")


def parse_hometax_excel(raw: bytes, filename: str) -> list[HometaxInvoice]:
    try:
        rows = _read_rows(raw, filename)
    except HometaxParseError:
        raise
    except Exception as exc:
        logger.error(f"[HometaxImport] 엑셀 읽기 실패: {exc}")
        raise HometaxParseError("엑셀 파일을 읽지 못했습니다. 파일이 손상되었거나 암호가 걸려 있는지 확인해주세요.") from exc

    # 머리글 행 찾기: 승인번호와 공급가액이 함께 있는 행
    header_idx = None
    for i, row in enumerate(rows[:30]):
        names = {_norm(c) for c in row}
        if "승인번호" in names and "공급가액" in names:
            header_idx = i
            break
    if header_idx is None:
        raise HometaxParseError("홈택스 세금계산서 목록 형식이 아닙니다. '승인번호', '공급가액' 열이 있는 엑셀을 올려주세요.")

    columns: dict[str, int] = {}
    party_seen: dict[str, int] = {}  # 접두어 없는 머리글이 몇 번째로 나왔는지
    for idx, cell in enumerate(rows[header_idx]):
        name = _norm(cell)
        side = None
        base = name
        if name.startswith("공급받는자"):
            side, base = "buyer", name[len("공급받는자") :]
        elif name.startswith("공급자"):
            side, base = "supplier", name[len("공급자") :]

        kind = _PARTY_BASES.get(base)
        if kind is not None:
            if side is None:
                nth = party_seen.get(kind, 0)
                party_seen[kind] = nth + 1
                side = "supplier" if nth == 0 else "buyer" if nth == 1 else None  # 세 번째(수탁사업자)는 쓰지 않는다
            if side is not None:
                columns.setdefault(f"{side}_{kind}", idx)
            continue

        field_name = _ALIASES.get(name)
        # 같은 이름이 여러 번 나오면 처음 나온 열을 쓴다 (품목 영역의 값과 섞이지 않게 이름이 다른 열만 쓴다).
        if field_name:
            columns.setdefault(field_name, idx)

    if "supplier_reg" not in columns or "buyer_reg" not in columns:
        raise HometaxParseError("공급자/공급받는자 사업자등록번호 열을 찾지 못했습니다.")

    def get(row: list, key: str):
        idx = columns.get(key)
        return row[idx] if idx is not None and idx < len(row) else None

    invoices: dict[str, HometaxInvoice] = {}
    for row in rows[header_idx + 1 :]:
        approval = digits_only(get(row, "approval_no")) or str(get(row, "approval_no") or "").strip()
        if not approval:
            continue
        item_name = str(get(row, "item_name") or "").strip()
        item = HometaxItem(
            name=item_name,
            quantity=_to_float(get(row, "item_qty")),
            unit_price=_to_float(get(row, "item_price")),
            supply=_to_int(get(row, "item_supply")),
            vat=_to_int(get(row, "item_vat")),
        )
        has_item = bool(item_name) or item.supply is not None
        if approval in invoices:
            # 품목별로 줄이 나뉜 파일: 같은 승인번호의 다음 줄은 품목만 더한다.
            if has_item:
                invoices[approval].items.append(item)
            continue
        invoices[approval] = HometaxInvoice(
            approval_no=approval,
            write_date=_to_date(get(row, "write_date")) or _to_date(get(row, "issue_date")),
            supplier_reg=digits_only(get(row, "supplier_reg")),
            supplier_name=str(get(row, "supplier_name") or "").strip(),
            supplier_ceo=str(get(row, "supplier_ceo") or "").strip(),
            supplier_addr=str(get(row, "supplier_addr") or "").strip(),
            buyer_reg=digits_only(get(row, "buyer_reg")),
            buyer_name=str(get(row, "buyer_name") or "").strip(),
            buyer_ceo=str(get(row, "buyer_ceo") or "").strip(),
            buyer_addr=str(get(row, "buyer_addr") or "").strip(),
            supply=_to_int(get(row, "supply")),
            vat=_to_int(get(row, "vat")),
            total=_to_int(get(row, "total")),
            purpose=str(get(row, "purpose") or "").strip(),
            items=[item] if has_item else [],
        )

    logger.debug(f"[HometaxImport] 세금계산서 {len(invoices)}건 파싱 (머리글 행={header_idx + 1})")
    return list(invoices.values())
