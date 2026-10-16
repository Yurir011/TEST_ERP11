"""금액 계산 특성화 테스트.

현재 구현은 부가세를 파이썬 round()로 계산한다. round()는 0.5를 짝수로 반올림(은행가 반올림)하므로
공급가액 끝자리에 따라 일반적인 사사오입과 다른 결과가 나온다. 리팩토링 중 계산 결과가 달라지지 않도록
"지금 동작"을 그대로 고정하고, 방식을 바꿀지는 별도 승인 사항이다 (docs/refactoring/02-plan.md P2).
"""
from types import SimpleNamespace

import pytest

from app.models.project_document import calc_amount
from app.routers.transactions import _doc_amounts


def _doc(*items):
    return SimpleNamespace(items=[SimpleNamespace(quantity=q, unit_price=p) for q, p in items])


@pytest.mark.parametrize(
    "quantity, unit_price, expected",
    [
        (1, 1000, 1000),
        (3, 1000, 3000),
        (3, 454545.5, 1363636),  # 1,363,636.5 → 짝수쪽(…36)으로 반올림
        (2, 0.5, 1),
        (1, 0.5, 0),  # 0.5 → 0 (은행가 반올림)
        (1, 1.5, 2),
    ],
)
def test_calc_amount(quantity, unit_price, expected):
    assert calc_amount(quantity, unit_price) == expected


@pytest.mark.parametrize(
    "supply, expected_vat",
    [
        (1000, 100),
        (100000, 10000),
        (15, 2),  # 1.5 → 2
        (25, 2),  # 2.5 → 2 (사사오입이면 3)
        (35, 4),  # 3.5 → 4
        (45, 4),  # 4.5 → 4 (사사오입이면 5)
        (1, 0),  # 0.1 → 0
    ],
)
def test_vat_rounding_is_bankers_rounding(supply, expected_vat):
    supply_amount, vat = _doc_amounts(_doc((1, supply)))
    assert supply_amount == supply
    assert vat == expected_vat


def test_doc_amounts_sums_rounded_items():
    # 품목별로 반올림한 금액을 합산한 값이 공급가액이다
    supply, vat = _doc_amounts(_doc((3, 454545.5), (1, 1000)))
    assert supply == 1363636 + 1000
    assert vat == round(supply * 0.1)
