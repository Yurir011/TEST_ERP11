"""거래처 잔액 변경 이력 API(GET /api/clients/{id}/balance-history) 테스트."""
import pytest

from app.models.user import JobTitle, UserRole


@pytest.fixture()
def admin(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표님")


@pytest.fixture()
def h(auth_headers, admin):
    return auth_headers(admin)


def _tx(client, h, client_id, supply, type_="purchase"):
    res = client.post(
        "/api/transactions", headers=h,
        json={"type": type_, "transaction_date": "2026-10-13", "client_id": client_id, "item_name": "세금계산서 (60)", "supply_amount": supply, "vat_amount": supply // 10},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _pay(client, h, client_id, tx_id, amount, type_="withdrawal", category="미지급금"):
    res = client.post(
        "/api/payments", headers=h,
        json={"type": type_, "payment_date": "2026-10-16", "category": category, "description": "세금계산서 (60) 지급(일부)",
              "amount": amount, "method": "bank_transfer", "bank_type": "ibk", "client_id": client_id, "transaction_id": tx_id},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_history_shows_each_change_with_cause_newest_first(client, h, make_client):
    c = make_client(name="크레신")
    tx = _tx(client, h, c.id, 500_000)  # 미지급금 +550,000
    pay = _pay(client, h, c.id, tx["id"], 500_000)  # 부분 지급 -500,000

    res = client.get(f"/api/clients/{c.id}/balance-history?kind=payable", headers=h)
    assert res.status_code == 200, res.text
    rows = res.json()
    assert [(r["before"], r["after"], r["delta"]) for r in rows] == [(550_000, 50_000, -500_000), (0, 550_000, 550_000)]
    assert rows[0]["source_type"] == "payment" and rows[0]["source_id"] == pay["id"]
    assert "지급" in rows[0]["description"]
    assert rows[1]["source_type"] == "transaction" and rows[1]["source_id"] == tx["id"]
    assert rows[0]["user_name"] == "대표님"
    assert all(r["source_deleted"] is False for r in rows)


def test_kinds_are_separated(client, h, make_client):
    c = make_client()
    _tx(client, h, c.id, 100_000, type_="sales")  # 미수금만 변화
    assert len(client.get(f"/api/clients/{c.id}/balance-history?kind=receivable", headers=h).json()) == 1
    assert client.get(f"/api/clients/{c.id}/balance-history?kind=payable", headers=h).json() == []


def test_deleted_source_is_marked(client, h, make_client):
    c = make_client()
    tx = _tx(client, h, c.id, 100_000)
    client.delete(f"/api/transactions/{tx['id']}", headers=h)
    rows = client.get(f"/api/clients/{c.id}/balance-history?kind=payable", headers=h).json()
    assert len(rows) == 2  # 등록으로 증가, 삭제로 감소
    assert all(r["source_deleted"] is True for r in rows if r["source_type"] == "transaction")


def test_permission_menu_clients_is_enough(client, make_client, make_user, auth_headers):
    c = make_client()
    staff = make_user(menu_permissions=["clients"])
    outsider = make_user(menu_permissions=["payments"])
    assert client.get(f"/api/clients/{c.id}/balance-history", headers=auth_headers(staff)).status_code == 200
    assert client.get(f"/api/clients/{c.id}/balance-history", headers=auth_headers(outsider)).status_code == 403
    # 전체 감사 로그는 여전히 대표만
    assert client.get("/api/audit-logs", headers=auth_headers(staff)).status_code == 403


def test_unknown_client_and_bad_kind(client, h):
    assert client.get("/api/clients/999999/balance-history", headers=h).status_code == 404
    assert client.get("/api/clients/1/balance-history?kind=other", headers=h).status_code == 422
