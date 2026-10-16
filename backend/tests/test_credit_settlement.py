"""외상 잔액(거래처 미수금/미지급금)과 결제 처리 특성화 테스트.

대상: 거래 등록/수정/삭제, 전액·부분 결제, 결제 삭제 시 복원, 거래처 잔액만 줄이는 정산.
이 로직은 금액 정합성에 직접 영향을 주므로 리팩토링 전에 동작을 고정한다.
"""
from datetime import date

import pytest

from app.models.transaction import Transaction
from app.models.user import JobTitle, UserRole


@pytest.fixture()
def admin(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo)


@pytest.fixture()
def h(auth_headers, admin):
    return auth_headers(admin)


def _create_tx(client, headers, client_id, *, type_="sales", supply=1_000_000, vat=100_000, settled=False):
    res = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "type": type_,
            "transaction_date": "2026-10-01",
            "client_id": client_id,
            "item_name": "테스트 품목",
            "supply_amount": supply,
            "vat_amount": vat,
            "settled": settled,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _pay(client, headers, *, client_id, tx_id=None, amount, type_="deposit", category="외상매출금"):
    return client.post(
        "/api/payments",
        headers=headers,
        json={
            "type": type_,
            "payment_date": "2026-10-16",
            "category": category,
            "description": "테스트 결제",
            "amount": amount,
            "method": "bank_transfer",
            "bank_type": "ibk",
            "client_id": client_id,
            "transaction_id": tx_id,
        },
    )


def _tx_row(db, tx_id):
    row = db.get(Transaction, tx_id)
    db.refresh(row)
    return row


# ── 거래 등록/수정/삭제와 잔액 ─────────────────────────────────────

def test_unsettled_sales_increases_receivable(client, h, make_client, db):
    c = make_client()
    _create_tx(client, h, c.id)
    db.refresh(c)
    assert c.receivable_amount == 1_100_000
    assert c.payable_amount == 0


def test_unsettled_purchase_increases_payable(client, h, make_client, db):
    c = make_client()
    _create_tx(client, h, c.id, type_="purchase", supply=500_000, vat=50_000)
    db.refresh(c)
    assert c.payable_amount == 550_000
    assert c.receivable_amount == 0


def test_settled_transaction_does_not_touch_balance(client, h, make_client, db):
    c = make_client()
    _create_tx(client, h, c.id, settled=True)
    db.refresh(c)
    assert c.receivable_amount == 0


def test_delete_unsettled_transaction_removes_its_balance(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    assert client.delete(f"/api/transactions/{tx['id']}", headers=h).status_code == 204
    db.refresh(c)
    assert c.receivable_amount == 0


def test_update_transaction_amount_adjusts_balance(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    res = client.put(
        f"/api/transactions/{tx['id']}",
        headers=h,
        json={
            "type": "sales",
            "transaction_date": "2026-10-01",
            "client_id": c.id,
            "item_name": "테스트 품목",
            "supply_amount": 2_000_000,
            "vat_amount": 200_000,
            "settled": False,
        },
    )
    assert res.status_code == 200, res.text
    db.refresh(c)
    assert c.receivable_amount == 2_200_000


# ── 전액 결제 ─────────────────────────────────────────────────────

def test_full_payment_settles_transaction_and_clears_balance(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    res = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=1_100_000)
    assert res.status_code == 201, res.text
    db.refresh(c)
    row = _tx_row(db, tx["id"])
    assert row.settled is True
    assert row.settled_date == date(2026, 10, 16)
    assert row.paid_amount == 0  # 한 번에 전액 결제하면 부분 결제 누적은 없다
    assert c.receivable_amount == 0


def test_delete_full_payment_restores_transaction_and_balance(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    pay = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=1_100_000).json()
    assert client.delete(f"/api/payments/{pay['id']}", headers=h).status_code == 204
    db.refresh(c)
    assert _tx_row(db, tx["id"]).settled is False
    assert c.receivable_amount == 1_100_000


# ── 부분 결제 ─────────────────────────────────────────────────────

def test_partial_payment_reduces_remaining_and_balance(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    res = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=400_000)
    assert res.status_code == 201, res.text
    db.refresh(c)
    row = _tx_row(db, tx["id"])
    assert row.settled is False
    assert row.paid_amount == 400_000
    assert c.receivable_amount == 700_000


def test_partial_then_final_payment_completes_transaction(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=400_000)
    res = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=700_000)
    assert res.status_code == 201, res.text
    db.refresh(c)
    row = _tx_row(db, tx["id"])
    assert row.settled is True
    assert row.paid_amount == 400_000
    assert c.receivable_amount == 0


def test_transaction_out_includes_payment_history(client, h, make_client):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=300_000)
    _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=200_000)
    rows = client.get("/api/transactions?settled=false", headers=h).json()
    mine = next(r for r in rows if r["id"] == tx["id"])
    assert mine["paid_amount"] == 500_000
    assert [p["amount"] for p in mine["payment_history"]] == [300_000, 200_000]


def test_delete_partial_payment_restores_remaining(client, h, make_client, db):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    pay = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=400_000).json()
    assert client.delete(f"/api/payments/{pay['id']}", headers=h).status_code == 204
    db.refresh(c)
    assert _tx_row(db, tx["id"]).paid_amount == 0
    assert c.receivable_amount == 1_100_000


def test_cannot_delete_partial_payment_of_completed_transaction(client, h, make_client):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    partial = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=400_000).json()
    _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=700_000)
    res = client.delete(f"/api/payments/{partial['id']}", headers=h)
    assert res.status_code == 400


def test_cannot_edit_partial_payment_amount(client, h, make_client):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    partial = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=400_000).json()
    res = client.put(
        f"/api/payments/{partial['id']}",
        headers=h,
        json={
            "type": "deposit",
            "payment_date": "2026-10-16",
            "category": "외상매출금",
            "description": "수정",
            "amount": 500_000,
            "method": "bank_transfer",
            "bank_type": "ibk",
            "client_id": c.id,
        },
    )
    assert res.status_code == 400


def test_cannot_lower_total_below_paid_amount(client, h, make_client):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=900_000)
    res = client.put(
        f"/api/transactions/{tx['id']}",
        headers=h,
        json={
            "type": "sales",
            "transaction_date": "2026-10-01",
            "client_id": c.id,
            "item_name": "테스트 품목",
            "supply_amount": 500_000,
            "vat_amount": 50_000,
            "settled": False,
        },
    )
    assert res.status_code == 400


@pytest.mark.parametrize("amount", [400_000, 1_100_000], ids=["partial", "full"])
def test_cannot_delete_transaction_with_linked_payments(client, h, make_client, db, amount):
    """R5: 결제한 입출금이 남은 매입매출은 지울 수 없다. 예전에는 지워졌고, 그 뒤 입출금을 지우면
    연결 없는 잔액 정산으로 취급되어 미수금이 되살아났다(부분 400,000 / 전액 1,100,000 이 남음)."""
    c = make_client()
    tx = _create_tx(client, h, c.id)
    pay = _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=amount).json()
    db.refresh(c)
    before = c.receivable_amount

    res = client.delete(f"/api/transactions/{tx['id']}", headers=h)
    assert res.status_code == 400
    assert "입출금 내역 1건" in res.json()["detail"]
    db.refresh(c)
    assert c.receivable_amount == before  # 아무것도 바뀌지 않는다
    assert db.get(Transaction, tx["id"]) is not None

    # 안내대로 입출금을 먼저 지우면 외상으로 돌아오고, 그다음 거래를 지우면 잔액이 0 이 된다
    assert client.delete(f"/api/payments/{pay['id']}", headers=h).status_code == 204
    assert client.delete(f"/api/transactions/{tx['id']}", headers=h).status_code == 204
    db.refresh(c)
    assert c.receivable_amount == 0


# ── 거래처 잔액만 줄이는 정산(거래 연결 없음) ────────────────────────

def test_balance_only_receipt_reduces_receivable(client, h, make_client, db):
    c = make_client(receivable=500_000)
    res = _pay(client, h, client_id=c.id, amount=200_000)
    assert res.status_code == 201, res.text
    db.refresh(c)
    assert c.receivable_amount == 300_000


def test_balance_only_payment_over_balance_is_rejected(client, h, make_client, db):
    # 잔액보다 큰 금액은 잔액 정산으로 받지 않는다 (예전에는 0에서 멈춘 뒤 삭제 시 잔액이 부풀려졌다)
    c = make_client(payable=100_000)
    res = _pay(client, h, client_id=c.id, amount=250_000, type_="withdrawal", category="미지급금")
    assert res.status_code == 400
    assert "미지급금 잔액" in res.json()["detail"]
    db.refresh(c)
    assert c.payable_amount == 100_000  # 바뀌지 않는다


def test_balance_only_payment_equal_to_balance_is_allowed(client, h, make_client, db):
    c = make_client(payable=100_000)
    assert _pay(client, h, client_id=c.id, amount=100_000, type_="withdrawal", category="미지급금").status_code == 201
    db.refresh(c)
    assert c.payable_amount == 0


def test_balance_only_rule_does_not_affect_other_categories(client, h, make_client):
    c = make_client(payable=0)
    # 정산 분류가 아닌 일반 출금은 거래처 잔액과 무관하다
    assert _pay(client, h, client_id=c.id, amount=50_000, type_="withdrawal", category="소모품비").status_code == 201


def test_editing_balance_only_payment_checks_balance_after_revert(client, h, make_client, db):
    c = make_client(receivable=500_000)
    pay = _pay(client, h, client_id=c.id, amount=200_000).json()  # 잔액 30만
    body = {
        "type": "deposit", "payment_date": "2026-10-16", "category": "외상매출금", "description": "수정",
        "method": "bank_transfer", "bank_type": "ibk", "client_id": c.id,
    }
    # 되돌리면 잔액 50만 → 50만까지는 수정 가능, 60만은 불가
    assert client.put(f"/api/payments/{pay['id']}", headers=h, json={**body, "amount": 600_000}).status_code == 400
    assert client.put(f"/api/payments/{pay['id']}", headers=h, json={**body, "amount": 500_000}).status_code == 200
    db.refresh(c)
    assert c.receivable_amount == 0


def test_delete_balance_only_receipt_restores_receivable(client, h, make_client, db):
    c = make_client(receivable=500_000)
    pay = _pay(client, h, client_id=c.id, amount=200_000).json()
    client.delete(f"/api/payments/{pay['id']}", headers=h)
    db.refresh(c)
    assert c.receivable_amount == 500_000


def test_linkable_transactions_show_remaining_amount(client, h, make_client):
    c = make_client()
    tx = _create_tx(client, h, c.id)
    _pay(client, h, client_id=c.id, tx_id=tx["id"], amount=400_000)
    rows = client.get("/api/payments/linkable-transactions", headers=h).json()
    mine = next(r for r in rows if r["id"] == tx["id"])
    assert mine["total_amount"] == 700_000  # 부분 결제된 건은 남은 금액으로 불러온다
