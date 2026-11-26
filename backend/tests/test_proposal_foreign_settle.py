"""외화(달러) 구매: 참고 금액은 남기고, 수기로 입력한 실결제 원화 금액으로 매입·입출금을 만든다 (부가세 없음 가능)."""
import pytest

from app.models.payment import Payment
from app.models.transaction import Transaction
from app.services import project_document_files as doc_files
from app.services import proposal_files


@pytest.fixture(autouse=True)
def _no_files(monkeypatch):
    monkeypatch.setattr(proposal_files, "regenerate_pdf", lambda p: None)
    monkeypatch.setattr(doc_files, "regenerate_documents", lambda db, doc: None)


def _usd_proposal(client, headers):
    res = client.post(
        "/api/proposals",
        headers=headers,
        json={"kind": "구매", "title": "해외 부품", "topic": "부품", "content": "구매", "issue_date": "2026-11-20",
              "vendor_name": "Mouser", "amount": 1000, "currency": "USD", "is_final_decision": True},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_foreign_settlement_creates_ledger_in_won_without_vat(client, db, make_user, auth_headers):
    h = auth_headers(make_user(name="기안자"))
    p = _usd_proposal(client, h)
    # 온라인 주문(발주서 없이) 발주 완료: 실결제 금액을 넣기 전에는 매입이 없다
    res = client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True, "online": True}, headers=h)
    assert res.status_code == 200, res.text
    assert db.query(Transaction).count() == 0

    res = client.put(
        f"/api/proposals/{p['id']}/settlement",
        json={"settle_amount": 1_450_000, "settle_rate": 1380.5, "no_vat": True},
        headers=h,
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["amount"] == 1000 and out["currency"] == "USD"  # 외화 금액은 참고용으로 남는다
    assert out["settle_amount"] == 1_450_000 and out["no_vat"] is True
    assert out["payable_total"] == 1_450_000  # 부가세 없음
    tx = db.query(Transaction).one()
    assert (tx.supply_amount, tx.vat_amount, tx.total_amount) == (1_450_000, 0, 1_450_000)

    # 결제는 원화로 입출금에 반영된다
    res = client.post(
        f"/api/proposals/{p['id']}/payments",
        json={"payment_method": "deposit", "account": "ibk", "amount": 1_450_000},
        headers=h,
    )
    assert res.status_code in (201, 400), res.text
    if res.status_code == 201:
        assert db.query(Payment).one().amount == 1_450_000


def test_foreign_settlement_with_vat_and_validation(client, db, make_user, auth_headers):
    h = auth_headers(make_user(name="기안자"))
    p = _usd_proposal(client, h)
    client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True, "online": True}, headers=h)
    # 발주 전/원화 품의서/0원은 거절
    assert client.put(f"/api/proposals/{p['id']}/settlement", json={"settle_amount": 0, "settle_rate": 1300}, headers=h).status_code == 422
    res = client.put(f"/api/proposals/{p['id']}/settlement", json={"settle_amount": 1_000_000, "settle_rate": 1300, "no_vat": False}, headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["payable_total"] == 1_100_000  # 부가세를 끄지 않으면 10% 가산


def test_settlement_rejected_for_krw_and_before_order(client, make_user, auth_headers):
    h = auth_headers(make_user(name="기안자"))
    krw = client.post(
        "/api/proposals", headers=h,
        json={"kind": "구매", "title": "원화", "topic": "x", "content": "x", "issue_date": "2026-11-20", "amount": 1000, "is_final_decision": True},
    ).json()
    assert client.put(f"/api/proposals/{krw['id']}/settlement", json={"settle_amount": 1000, "settle_rate": 1}, headers=h).status_code == 400
    usd = _usd_proposal(client, h)
    assert client.put(f"/api/proposals/{usd['id']}/settlement", json={"settle_amount": 1000, "settle_rate": 1300}, headers=h).status_code == 400


def test_amount_change_keeps_won_ledger_and_edits_reference(client, db, make_user, auth_headers):
    h = auth_headers(make_user(name="기안자"))
    p = _usd_proposal(client, h)
    client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True, "online": True}, headers=h)
    client.put(f"/api/proposals/{p['id']}/settlement", json={"settle_amount": 1_450_000, "settle_rate": 1380.5, "no_vat": True}, headers=h)

    # 달러 참고 금액만 고치면 원화 장부는 그대로
    res = client.put(f"/api/proposals/{p['id']}/amount", json={"amount": 1200}, headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["amount"] == 1200 and res.json()["settle_amount"] == 1_450_000
    assert db.query(Transaction).one().total_amount == 1_450_000

    # 달러·환율·원화를 한꺼번에 고치면 원화 장부가 바뀐다
    res = client.put(
        f"/api/proposals/{p['id']}/amount",
        json={"amount": 1200, "settle_amount": 1_700_000, "settle_rate": 1400, "no_vat": True},
        headers=h,
    )
    assert res.status_code == 200, res.text
    db.expire_all()
    assert db.query(Transaction).one().total_amount == 1_700_000
