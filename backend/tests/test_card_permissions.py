"""법인카드 소유 직원과 사용 권한: 소유 직원·허용받은 직원·관리자만 내역 등록·수정, 권한 부여는 소유 직원과 관리자."""
import pytest

from app.models.user import JobTitle, UserRole

PAY = {"type": "withdrawal", "payment_date": "2026-11-05", "category": "소모품비", "description": "테스트", "amount": 10_000, "method": "corporate_card"}


@pytest.fixture()
def setup(client, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표")
    owner = make_user(name="소유직원", menu_permissions=["payments"])
    friend = make_user(name="허용직원", menu_permissions=["payments"])
    other = make_user(name="다른직원", menu_permissions=["payments"])
    ha = auth_headers(admin)
    card = client.post("/api/payment-accounts", headers=ha, json={"kind": "card", "nickname": "김 카드", "issuer": "신한카드", "last4": "4321", "owner_user_id": owner.id})
    assert card.status_code == 201, card.text
    return {"admin": admin, "owner": owner, "friend": friend, "other": other, "ha": ha, "card": card.json(), "h": auth_headers}


def _pay(client, h, code, **over):
    return client.post("/api/payments", headers=h, json={**PAY, "card_type": code, **over})


def test_only_owner_and_admin_can_register_by_default(client, setup):
    s, code = setup, setup["card"]["code"]
    assert s["card"]["owner_name"] == "소유직원" and s["card"]["last4"] == "4321" and s["card"]["issuer"] == "신한카드"
    assert _pay(client, s["h"](s["owner"]), code).status_code == 201
    assert _pay(client, s["ha"], code).status_code == 201
    res = _pay(client, s["h"](s["other"]), code)
    assert res.status_code == 403 and "법인카드" in res.json()["detail"]


def test_owner_grants_and_revokes_access_and_delegate_can_edit(client, setup):
    s, code, cid = setup, setup["card"]["code"], setup["card"]["id"]
    pay_id = _pay(client, s["h"](s["owner"]), code).json()["id"]
    hf = s["h"](s["friend"])
    assert client.put(f"/api/payments/{pay_id}", headers=hf, json={**PAY, "card_type": code, "amount": 20_000}).status_code == 403

    granted = client.put(f"/api/payment-accounts/{cid}/delegates", headers=s["h"](s["owner"]), json={"user_ids": [s["friend"].id]})  # 소유 직원이 허용
    assert granted.status_code == 200 and granted.json()["delegate_ids"] == [s["friend"].id]
    assert _pay(client, hf, code).status_code == 201
    assert client.put(f"/api/payments/{pay_id}", headers=hf, json={**PAY, "card_type": code, "amount": 20_000}).status_code == 200
    assert client.delete(f"/api/payments/{pay_id}", headers=hf).status_code == 204
    mine = next(a for a in client.get("/api/payment-accounts", headers=hf).json() if a["id"] == cid)
    assert mine["can_use"] is True and mine["can_manage"] is False

    assert client.put(f"/api/payment-accounts/{cid}/delegates", headers=s["ha"], json={"user_ids": []}).status_code == 200  # 관리자가 회수
    assert _pay(client, hf, code).status_code == 403


def test_only_owner_and_admin_can_manage_delegates(client, setup):
    s, cid = setup, setup["card"]["id"]
    body = {"user_ids": [s["other"].id]}
    assert client.put(f"/api/payment-accounts/{cid}/delegates", headers=s["h"](s["friend"]), json=body).status_code == 403
    assert client.put(f"/api/payment-accounts/{cid}/delegates", headers=s["h"](s["other"]), json=body).status_code == 403
    assert client.put(f"/api/payment-accounts/{cid}/delegates", headers=s["h"](s["owner"]), json=body).status_code == 200
    assert client.put(f"/api/payment-accounts/{cid}/delegates", headers=s["ha"], json={"user_ids": [99999]}).status_code == 400
    staff = client.get("/api/payment-accounts/staff", headers=s["h"](s["friend"])).json()
    assert {"id": s["owner"].id, "name": "소유직원"} in staff


def test_cards_without_owner_stay_open_and_only_admin_sets_owner(client, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표")
    staff = make_user(name="직원", menu_permissions=["payments"])
    ha, hs = auth_headers(admin), auth_headers(staff)
    shared = client.post("/api/payment-accounts", headers=ha, json={"kind": "card", "nickname": "공용", "issuer": "BC", "last4": "1111"}).json()
    assert shared["owner_user_id"] is None and shared["can_use"] is True
    assert _pay(client, hs, shared["code"]).status_code == 201  # 소유 직원이 없는 카드는 지금처럼 누구나
    upd = {"nickname": "공용", "issuer": "BC", "last4": "1111", "is_active": True, "owner_user_id": staff.id}
    assert client.put(f"/api/payment-accounts/{shared['id']}", headers=hs, json=upd).status_code == 403  # 소유 직원 지정은 관리자만
    assert client.put(f"/api/payment-accounts/{shared['id']}", headers=ha, json=upd).json()["owner_user_id"] == staff.id
