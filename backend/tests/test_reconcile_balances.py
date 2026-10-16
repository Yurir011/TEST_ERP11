"""거래처 잔액 정리 스크립트(scripts/reconcile_client_balances.py)의 기대 잔액 계산 테스트."""
from datetime import date

from app.models.transaction import Transaction, TransactionType
from app.scripts.reconcile_client_balances import expected_balances


def _tx(db, client, creator, type_, total, paid=0, settled=False):
    db.add(
        Transaction(
            type=type_, transaction_date=date(2026, 10, 1), client_id=client.id, item_name="x",
            supply_amount=total, vat_amount=0, total_amount=total, paid_amount=paid, settled=settled, created_by=creator.id,
        )
    )
    db.flush()


def test_expected_balances_use_remaining_of_unsettled_transactions(db, make_client, make_user):
    creator = make_user()
    c = make_client(receivable=999, payable=999)  # 현재 잔액은 계산에 쓰지 않는다
    _tx(db, c, creator, TransactionType.sales, 1_000_000, paid=400_000)  # 남은 60만
    _tx(db, c, creator, TransactionType.sales, 200_000)  # 남은 20만
    _tx(db, c, creator, TransactionType.sales, 300_000, settled=True)  # 결제완료는 제외
    _tx(db, c, creator, TransactionType.purchase, 550_000, paid=510_000)  # 남은 4만
    assert expected_balances(db)[c.id] == (800_000, 40_000)


def test_client_without_unsettled_transactions_is_absent(db, make_client):
    c = make_client(receivable=500)
    assert c.id not in expected_balances(db)  # 정리하면 0이 된다
