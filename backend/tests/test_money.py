"""금액 계산 테스트 — 부가세와 품목 금액은 사사오입(0.5는 올림)으로 계산한다 (services/money.py).

이전 구현은 파이썬 round()(은행가 반올림)를 써서 공급가액 끝자리에 따라 사사오입과 다른 결과가 나왔다.
사용자 승인에 따라 사사오입으로 변경했고(2026-10-16), 이 테스트가 그 규칙을 고정한다.
"""
from types import SimpleNamespace

import pytest

from app.models.project_document import calc_amount
from app.routers.transactions import _doc_amounts
from app.services.money import round_half_up, vat_amount


def _doc(*items):
    return SimpleNamespace(items=[SimpleNamespace(quantity=q, unit_price=p) for q, p in items])


@pytest.mark.parametrize(
    "quantity, unit_price, expected",
    [
        (1, 1000, 1000),
        (3, 1000, 3000),
        (3, 454545.5, 1363637),  # 1,363,636.5 → 올림
        (2, 0.5, 1),
        (1, 0.5, 1),  # 0.5 → 1 (사사오입)
        (1, 1.5, 2),
        (1, 2.5, 3),  # 2.5 → 3 (은행가 반올림이면 2)
        (3, 0.1, 0),  # 0.3 → 0
        (3, 1.1, 3),  # 부동소수 오차(3.3000000000000003)가 있어도 3
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
        (25, 3),  # 2.5 → 3
        (35, 4),  # 3.5 → 4
        (45, 5),  # 4.5 → 5
        (5, 1),  # 0.5 → 1
        (4, 0),  # 0.4 → 0
        (1, 0),  # 0.1 → 0
        (0, 0),
    ],
)
def test_vat_rounding_is_half_up(supply, expected_vat):
    supply_amount, vat = _doc_amounts(_doc((1, supply)))
    assert supply_amount == supply
    assert vat == expected_vat


def test_doc_amounts_sums_rounded_items():
    # 품목별로 반올림한 금액을 합산한 값이 공급가액이다
    supply, vat = _doc_amounts(_doc((3, 454545.5), (1, 1000)))
    assert supply == 1363637 + 1000
    assert vat == vat_amount(supply)


def test_vat_amount_accepts_float_supply():
    # 한 건짜리 문서의 공급가액이 소수일 때도 오차 없이 사사오입한다
    assert vat_amount(12.5) == 1  # 1.25 → 1
    assert vat_amount(25.0) == 3


@pytest.mark.parametrize("value, expected", [(0.5, 1), (1.5, 2), (2.5, 3), (-0.5, -1), (2.4999, 2), (10, 10)])
def test_round_half_up(value, expected):
    assert round_half_up(value) == expected
