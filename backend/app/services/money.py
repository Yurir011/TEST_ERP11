"""금액 계산 공통 모듈 — 부가세와 원 단위 반올림 규칙을 한 곳에서 관리한다.

견적서·거래명세서·세금계산서·발주서(문서 PDF/엑셀)와 매입매출 장부가 같은 규칙으로 계산해야
문서 금액과 장부 금액이 어긋나지 않는다. 계산 규칙을 바꿀 때는 이 파일만 수정한다.

반올림은 사사오입(0.5는 항상 올림)이다. 파이썬 내장 round()는 0.5를 짝수 쪽으로 보내는
은행가 반올림이라(예: round(2.5) == 2) 세무 관행과 다르므로 쓰지 않는다.
소수 오차(3.5000000000000004 등)를 피하려고 float이 아니라 Decimal로 계산한다.
"""
from decimal import ROUND_HALF_UP, Decimal

VAT_RATE = Decimal("0.1")  # 부가가치세율 10%
_ONE = Decimal("1")


def round_half_up(value: Decimal | float | int) -> int:
    """원 단위 사사오입 반올림."""
    return int(Decimal(str(value)).quantize(_ONE, rounding=ROUND_HALF_UP))


def vat_amount(supply: float | int) -> int:
    """공급가액에 대한 부가세(원 단위, 사사오입)."""
    return round_half_up(Decimal(str(supply)) * VAT_RATE)


def line_amount(quantity: float | int, unit_price: float | int) -> int:
    """품목 금액 = 수량 x 단가 (원 단위, 사사오입). 단가가 소수(예: 454,545.5)일 수 있다."""
    return round_half_up(Decimal(str(quantity)) * Decimal(str(unit_price)))
