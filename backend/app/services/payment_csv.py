import csv
import io
import re
from datetime import date

DATE_ALIASES = {"날짜", "이용일자", "거래일자", "승인일자", "date"}
DESC_ALIASES = {"내용", "가맹점명", "적요", "가맹점", "description", "이용가맹점"}
AMOUNT_ALIASES = {"금액", "이용금액", "출금액", "승인금액", "amount"}


class CsvParseError(Exception):
    pass


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvParseError("파일 인코딩을 인식할 수 없습니다 (UTF-8 또는 CP949만 지원).")


def _parse_date(value: str) -> date | None:
    value = value.strip()
    for fmt_sep in (".", "-", "/"):
        parts = value.split(fmt_sep)
        if len(parts) == 3:
            try:
                y, m, d = (int(p) for p in parts)
                return date(y, m, d)
            except ValueError:
                continue
    return None


def _parse_amount(value: str) -> int | None:
    cleaned = re.sub(r"[^\d-]", "", value.strip())
    if not cleaned or cleaned == "-":
        return None
    try:
        return abs(int(cleaned))
    except ValueError:
        return None


def parse_card_statement_csv(raw: bytes) -> list[dict]:
    """법인카드 CSV 명세서를 파싱해 [{payment_date, description, amount}, ...] 형태로 반환한다.
    헤더 컬럼명은 은행/카드사마다 달라서 흔히 쓰이는 이름들을 매칭한다."""
    text = _decode(raw)
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        raise CsvParseError("파일에 내용이 없습니다.")

    header_idx = None
    col_map: dict[str, int] = {}
    for i, row in enumerate(rows[:10]):
        normalized = [c.strip() for c in row]
        found = {}
        for j, cell in enumerate(normalized):
            if cell in DATE_ALIASES:
                found["date"] = j
            elif cell in DESC_ALIASES:
                found["description"] = j
            elif cell in AMOUNT_ALIASES:
                found["amount"] = j
        if len(found) >= 2:
            header_idx = i
            col_map = found
            break

    if header_idx is None:
        raise CsvParseError(
            "헤더를 찾을 수 없습니다. '날짜/이용일자', '내용/가맹점명', '금액/이용금액' 같은 컬럼명이 필요합니다."
        )

    results = []
    for row in rows[header_idx + 1 :]:
        if "date" not in col_map or "amount" not in col_map:
            continue
        if col_map["date"] >= len(row) or col_map["amount"] >= len(row):
            continue

        payment_date = _parse_date(row[col_map["date"]])
        amount = _parse_amount(row[col_map["amount"]])
        description = row[col_map["description"]].strip() if "description" in col_map and col_map["description"] < len(row) else ""

        if payment_date is None or amount is None or amount == 0:
            continue

        results.append({"payment_date": payment_date, "description": description or "카드 사용", "amount": amount})

    return results
