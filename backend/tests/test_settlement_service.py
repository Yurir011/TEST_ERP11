"""결제 정산 서비스(services/settlement.py) 단위 테스트."""
from types import SimpleNamespace

import pytest

from app.models.payment import PaymentType
from app.services.settlement import (
    apply_balance_settlement,
    is_partial_payment,
    revert_balance_settlement,
    settlement_field,
)


@pytest.mark.parametrize(
    "payment_type, category, expected",
    [
        (PaymentType.deposit, "외상매출금", "receivable_amount"),
        (PaymentType.withdrawal, "외상매입금", "payable_amount"),
        (PaymentType.withdrawal, "미지급금", "payable_amount"),
        (PaymentType.deposit, "미지급금", None),  # 구분이 맞지 않으면 정산 대상이 아니다
        (PaymentType.withdrawal, "외상매출금", None),
        (PaymentType.withdrawal, "소모품비", None),  # 일반 입출금은 거래처 잔액에 영향이 없다
        (PaymentType.deposit, "미수", None),
    ],
)
def test_settlement_field(payment_type, category, expected):
    assert settlement_field(payment_type, category) == expected


@pytest.mark.parametrize(
    "total, paid, amount, expected",
    [
        (1000, 0, 400, True),  # 일부만
        (1000, 0, 1000, False),  # 전액
        (1000, 0, 1500, False),  # 초과도 전액 결제로 본다 (현재 동작)
        (1000, 600, 400, False),  # 남은 금액을 정확히 채움
        (1000, 600, 100, True),
        (1000, 0, 0, False),  # 0원은 부분 결제가 아니다
    ],
)
def test_is_partial_payment(total, paid, amount, expected):
    tx = SimpleNamespace(total_amount=total, paid_amount=paid)
    assert is_partial_payment(tx, amount) is expected


def test_is_partial_payment_without_transaction():
    assert is_partial_payment(None, 100) is False


def test_balance_settlement_clamps_and_reverts():
    client = SimpleNamespace(id=1, receivable_amount=300)
    apply_balance_settlement(client, "receivable_amount", 500)
    assert client.receivable_amount == 0  # 음수가 되지 않는다
    revert_balance_settlement(client, "receivable_amount", 500)
    assert client.receivable_amount == 500  # 복원은 입력한 금액 그대로 더한다 (현재 동작: 차감 때 잘린 만큼은 복원되지 않는 비대칭이 있다)
