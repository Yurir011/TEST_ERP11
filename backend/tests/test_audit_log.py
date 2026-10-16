"""감사 로그(core/audit.py, routers/audit_logs.py) 테스트."""
import pytest

from app.models.audit_log import AuditLog
from app.models.user import JobTitle, UserRole


@pytest.fixture()
def admin(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표님")


@pytest.fixture()
def h(auth_headers, admin):
    return auth_headers(admin)


def _logs(db, **filters):
    q = db.query(AuditLog)
    for k, v in filters.items():
        q = q.filter(getattr(AuditLog, k) == v)
    return q.order_by(AuditLog.id).all()


def _pay(client, headers, client_id, amount, category="외상매출금", type_="deposit"):
    return client.post(
        "/api/payments",
        headers=headers,
        json={"type": type_, "payment_date": "2026-10-16", "category": category, "description": "수금", "amount": amount,
              "method": "bank_transfer", "bank_type": "ibk", "client_id": client_id},
    )


# ── 돈: 입출금 · 거래처 잔액 · 매입매출 ─────────────────────────────

def test_payment_creation_records_payment_and_client_balance_change(client, db, h, admin, make_client):
    c = make_client(name="크레신", receivable=500_000)
    res = _pay(client, h, c.id, 200_000)
    assert res.status_code == 201, res.text

    pay_logs = _logs(db, entity_type="payment", entity_id=res.json()["id"])
    assert [log.action for log in pay_logs] == ["create"]
    assert pay_logs[0].user_id == admin.id and pay_logs[0].user_name == "대표님"
    assert pay_logs[0].request == "POST /api/payments"

    bal = _logs(db, entity_type="client", entity_id=c.id, action="update")
    assert len(bal) == 1
    assert bal[0].changes["receivable_amount"] == [500_000, 300_000]
    assert "미수금 500,000 → 300,000" in bal[0].summary
    assert bal[0].request == "POST /api/payments"  # 어떤 요청 때문에 잔액이 바뀌었는지


def test_transaction_update_records_only_changed_fields(client, db, h, make_client):
    c = make_client()
    tx = client.post(
        "/api/transactions", headers=h,
        json={"type": "sales", "transaction_date": "2026-10-01", "client_id": c.id, "item_name": "부품", "supply_amount": 100_000, "vat_amount": 10_000},
    ).json()
    client.put(
        f"/api/transactions/{tx['id']}", headers=h,
        json={"type": "sales", "transaction_date": "2026-10-01", "client_id": c.id, "item_name": "부품", "supply_amount": 200_000, "vat_amount": 20_000},
    )
    upd = _logs(db, entity_type="transaction", entity_id=tx["id"], action="update")
    assert len(upd) == 1
    assert set(upd[0].changes) == {"supply_amount", "vat_amount", "total_amount"}
    assert upd[0].changes["total_amount"] == [110_000, 220_000]


def test_delete_is_recorded_with_last_values(client, db, h, make_client):
    c = make_client()
    pay = _pay(client, h, c.id, 1_000, category="소모품비", type_="withdrawal").json()
    assert client.delete(f"/api/payments/{pay['id']}", headers=h).status_code == 204
    deleted = _logs(db, entity_type="payment", entity_id=pay["id"], action="delete")
    assert len(deleted) == 1
    assert deleted[0].changes["amount"] == [1_000, None]


def test_rejected_request_leaves_no_record(client, db, h, make_client):
    c = make_client(payable=100)
    before = db.query(AuditLog).count()
    res = _pay(client, h, c.id, 999_999, category="미지급금", type_="withdrawal")  # 잔액 초과로 거절
    assert res.status_code == 400
    assert db.query(AuditLog).count() == before


# ── 권한: 직원 계정 ────────────────────────────────────────────────

def test_permission_change_and_password_reset(client, db, h, make_user):
    staff = make_user(name="직원", menu_permissions=["clients"])
    res = client.put(
        f"/api/users/{staff.id}", headers=h,
        json={"name": "직원", "grade": "staff", "title": None, "menu_permissions": ["clients", "payments"], "hire_date": "2020-01-01"},
    )
    assert res.status_code == 200, res.text
    perm = _logs(db, entity_type="user", entity_id=staff.id, action="update")
    assert perm and perm[-1].changes["menu_permissions"] == [["clients"], ["clients", "payments"]]

    res = client.put(f"/api/users/{staff.id}/reset-password", headers=h, json={"new_password": "new-secret-123"})
    assert res.status_code == 200, res.text
    pw = [log for log in _logs(db, entity_type="user", entity_id=staff.id, action="update") if "hashed_password" in log.changes]
    assert pw and pw[-1].changes["hashed_password"] == ["(변경됨)", "(변경됨)"]  # 비밀번호 값은 남기지 않는다
    assert "new-secret-123" not in str(pw[-1].changes)


# ── 로그인 ────────────────────────────────────────────────────────

def test_login_events(client, db, make_user):
    user = make_user(name="로그인테스트")
    client.post("/api/auth/login", json={"email": user.email, "password": "wrong"})
    client.post("/api/auth/login", json={"email": user.email, "password": "pw-for-test"})
    actions = [log.action for log in _logs(db, entity_type="user", entity_id=user.id) if log.action.startswith("login")]
    assert actions == ["login_failed", "login_success"]
    ok = _logs(db, entity_type="user", entity_id=user.id, action="login_success")[0]
    assert ok.user_id == user.id and ok.ip is not None


def test_login_blocked_is_recorded(client, db, make_user):
    user = make_user()
    for _ in range(6):
        client.post("/api/auth/login", json={"email": user.email, "password": "wrong"})
    assert _logs(db, action="login_blocked")


# ── 소음 방지 ─────────────────────────────────────────────────────

def test_unaudited_fields_do_not_create_records(db, make_client):
    c = make_client()
    before = db.query(AuditLog).count()
    c.memo = "메모만 수정"  # memo 는 거래처 기록 대상 필드가 아니다
    db.flush()
    assert db.query(AuditLog).count() == before


def test_actor_outside_request_is_system(db, make_client):
    c = make_client()
    c.receivable_amount = 12_345
    db.flush()
    log = _logs(db, entity_type="client", entity_id=c.id, action="update")[-1]
    assert log.user_id is None and log.user_name.startswith("시스템(")


# ── 조회 API ──────────────────────────────────────────────────────

def test_audit_api_is_admin_only_and_filters(client, db, h, auth_headers, make_user, make_client):
    c = make_client(receivable=1_000)
    _pay(client, h, c.id, 400)
    plain = make_user(menu_permissions=["payments", "clients"])
    assert client.get("/api/audit-logs", headers=auth_headers(plain)).status_code == 403

    res = client.get(f"/api/audit-logs?entity_type=client&entity_id={c.id}", headers=h)
    assert res.status_code == 200
    rows = res.json()
    assert rows and all(r["entity_type"] == "client" and r["entity_id"] == c.id for r in rows)
    assert rows[0]["changes"]["receivable_amount"] == [1_000, 600]


def test_audit_api_has_no_write_endpoints():
    from app.main import app

    methods = {m for r in app.routes if getattr(r, "path", "").startswith("/api/audit-logs") for m in r.methods}
    assert methods <= {"GET", "HEAD"}


def test_audit_api_search_group_and_multi_type_filters(client, db, h, make_client, make_user):
    c = make_client(name="검색용거래처", receivable=1_000)
    _pay(client, h, c.id, 100)
    user = make_user()
    client.post("/api/auth/login", json={"email": user.email, "password": "wrong"})

    found = client.get("/api/audit-logs?q=검색용거래처", headers=h).json()
    assert found and all("검색용거래처" in (r["summary"] or "") or "검색용거래처" in (r["user_name"] or "") for r in found)

    logins = client.get("/api/audit-logs?action=login", headers=h).json()
    assert logins and all(r["action"].startswith("login_") for r in logins)

    multi = client.get("/api/audit-logs?entity_type=client,payment", headers=h).json()
    assert {r["entity_type"] for r in multi} <= {"client", "payment"} and len({r["entity_type"] for r in multi}) == 2
