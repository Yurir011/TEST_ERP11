"""카드·계좌 관리: 목록(기본 카드·계좌 포함), 관리자 추가·수정·삭제, 입출금에서 쓰기."""
import pytest

from app.models.payment import Payment
from app.models.payment_account import PaymentAccount
from app.models.user import JobTitle, UserRole
from app.services.payment_accounts import card_pay_day, display_name


@pytest.fixture()
def admin(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표")


def _new_card(client, h, **over):
    body = {"kind": "card", "nickname": "대표님 카드", "issuer": "신한카드", "last4": "1234", "pay_day": 10}
    body.update(over)
    res = client.post("/api/payment-accounts", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _pay(client, h, **over):
    body = {"type": "withdrawal", "payment_date": "2026-09-10", "category": "소모품비", "description": "테스트", "amount": 10_000, "method": "corporate_card"}
    body.update(over)
    return client.post("/api/payments", headers=h, json=body)


def test_default_cards_and_banks_are_listed_for_everyone(client, make_user, auth_headers):
    staff = make_user(name="직원")
    rows = client.get("/api/payment-accounts", headers=auth_headers(staff)).json()
    by_code = {(r["kind"], r["code"]): r for r in rows}
    assert by_code[("card", "bc")]["nickname"] == "BC카드" and by_code[("card", "bc")]["pay_day"] == 23
    assert {("bank", "ibk"), ("bank", "woori"), ("bank", "kb_kookmin"), ("card", "kb_kookmin")} <= set(by_code)


def test_only_admin_manages_accounts_and_input_is_validated(client, make_user, auth_headers, admin):
    staff = make_user(name="직원")
    body = {"kind": "card", "nickname": "법인 신한", "issuer": "신한카드", "last4": "5678", "pay_day": 5}
    assert client.post("/api/payment-accounts", headers=auth_headers(staff), json=body).status_code == 403
    h = auth_headers(admin)
    assert client.post("/api/payment-accounts", headers=h, json={**body, "last4": "12a4"}).status_code == 422  # 뒤 4자리는 숫자
    assert client.post("/api/payment-accounts", headers=h, json={**body, "nickname": "  "}).status_code == 422
    assert client.post("/api/payment-accounts", headers=h, json={**body, "pay_day": 40}).status_code == 422
    card = _new_card(client, h)
    assert card["code"].startswith("card_") and (card["nickname"], card["issuer"], card["last4"], card["pay_day"]) == ("대표님 카드", "신한카드", "1234", 10)
    # 계좌에는 결제일을 저장하지 않는다
    bank = client.post("/api/payment-accounts", headers=h, json={"kind": "bank", "nickname": "월급 통장", "issuer": "하나은행", "last4": "9876", "pay_day": 5}).json()
    assert bank["pay_day"] is None


def test_edit_nickname_keeps_link_to_existing_payments(client, db, auth_headers, admin):
    h = auth_headers(admin)
    card = _new_card(client, h)
    assert _pay(client, h, card_type=card["code"]).status_code == 201
    res = client.put(f"/api/payment-accounts/{card['id']}", headers=h, json={"nickname": "새 별명", "issuer": "신한카드", "last4": "4321", "pay_day": 12, "is_active": True})
    assert res.status_code == 200 and (res.json()["nickname"], res.json()["last4"], res.json()["in_use"]) == ("새 별명", "4321", True)
    assert display_name(db, "card", card["code"]) == "새 별명"  # 이름을 바꿔도 내역은 그대로 이어진다
    assert card_pay_day(db, card["code"]) == 12


def test_unregistered_or_hidden_account_is_rejected_for_new_payments(client, db, auth_headers, admin):
    h = auth_headers(admin)
    assert _pay(client, h, card_type="no_such_card").status_code == 400
    assert _pay(client, h, method="bank_transfer", bank_type="no_such_bank").status_code == 400
    card = _new_card(client, h)
    ok = _pay(client, h, card_type=card["code"])
    assert ok.status_code == 201 and ok.json()["card_type"] == card["code"]
    summary = {r["card_type"]: r for r in client.get("/api/payments/card-pending", headers=h).json()}
    assert summary[card["code"]]["count"] == 1  # 새 카드도 결제예정 요약에 나온다
    assert client.get("/api/payments/card-pending", headers=h).status_code == 200

    # 사용 내역이 있는 카드를 지우면 숨김 처리되고, 새 입출금에는 쓸 수 없지만 옛 내역의 카드명은 남는다
    deleted = client.delete(f"/api/payment-accounts/{card['id']}", headers=h)
    assert deleted.status_code == 200 and deleted.json()["is_active"] is False
    assert card["code"] not in [r["code"] for r in client.get("/api/payment-accounts", headers=h).json()]
    assert card["code"] in [r["code"] for r in client.get("/api/payment-accounts?include_inactive=true", headers=h).json()]
    assert _pay(client, h, card_type=card["code"]).status_code == 400
    assert db.query(Payment).filter(Payment.card_type == card["code"]).count() == 1


def test_unused_account_is_deleted_for_real(client, db, auth_headers, admin):
    h = auth_headers(admin)
    card = _new_card(client, h, nickname="안 쓴 카드")
    res = client.delete(f"/api/payment-accounts/{card['id']}", headers=h)
    assert res.status_code == 200 and res.json() is None
    assert db.get(PaymentAccount, card["id"]) is None
    assert client.delete(f"/api/payment-accounts/{card['id']}", headers=h).status_code == 404
