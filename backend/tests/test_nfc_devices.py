"""NFC 카드 등록(직원별)과 데스크톱 기기 등록·승인 API."""
import pytest

from app.config import settings
from app.models.audit_log import AuditLog
from app.models.client_device import ClientDevice
from app.models.nfc_card import NfcCard
from app.models.user import JobTitle, UserRole
from app.services import nfc as nfc_service

KEY_A = "a1" * 32
KEY_B = "b2" * 32


@pytest.fixture()
def ceo(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo)


# ── 카드 번호 처리 (순수 함수) ─────────────────────────────────────

@pytest.mark.parametrize(
    "raw, expected",
    [("0b9f515d", "0B9F515D"), ("0B:9F:51:5D", "0B9F515D"), (" 0b-9f-51-5d ", "0B9F515D"), ("04A1B2C3D4E5F6", "04A1B2C3D4E5F6")],
)
def test_normalize_uid(raw, expected):
    assert nfc_service.normalize_uid(raw) == expected


@pytest.mark.parametrize("raw", ["", "  ", "XYZ12345", "0B9F51", "0B9F515D0", "0B9F515D" * 4, "한글입니다요"])
def test_normalize_uid_rejects(raw):
    with pytest.raises(ValueError):
        nfc_service.normalize_uid(raw)


def test_uid_hash_is_stable_keyed_and_hides_uid(monkeypatch):
    h = nfc_service.uid_hash("0B9F515D")
    assert h == nfc_service.uid_hash("0B9F515D")
    assert h != nfc_service.uid_hash("0B9F625D")
    assert "0B9F515D" not in h and len(h) == 64
    monkeypatch.setattr(settings, "nfc_uid_secret", "x" * 40)
    assert nfc_service.uid_hash("0B9F515D") != h  # 비밀키가 다르면 값이 다르다


# ── 카드 등록 API ─────────────────────────────────────────────────

def test_register_list_and_hide_uid(client, db, ceo, make_user, auth_headers):
    emp = make_user(name="홍길동")
    r = client.post(f"/api/users/{emp.id}/nfc-cards", json={"uid": "0b:9f:51:5d", "label": "사원증"}, headers=auth_headers(ceo))
    assert r.status_code == 201
    body = r.json()
    assert body["uid_last4"] == "515D" and body["label"] == "사원증" and body["is_active"] is True
    assert "uid" not in body and "uid_hmac" not in body and "0B9F515D" not in r.text

    stored = db.query(NfcCard).one()
    assert stored.uid_hmac == nfc_service.uid_hash("0B9F515D") and "0B9F515D" not in stored.uid_hmac

    listed = client.get(f"/api/users/{emp.id}/nfc-cards", headers=auth_headers(ceo))
    assert [c["uid_last4"] for c in listed.json()] == ["515D"]
    assert "0B9F515D" not in listed.text


def test_audit_log_has_no_full_uid(client, db, ceo, make_user, auth_headers):
    emp = make_user()
    client.post(f"/api/users/{emp.id}/nfc-cards", json={"uid": "0B9F515D", "label": "사원증"}, headers=auth_headers(ceo))
    logs = db.query(AuditLog).filter(AuditLog.entity_type == "nfc_card").all()
    assert [log.action for log in logs] == ["nfc_card_registered"]
    assert all("0B9F515D" not in (log.summary or "") for log in logs)
    assert "515D" in logs[0].summary


def test_duplicate_card_conflict_names_owner(client, ceo, make_user, auth_headers):
    a, b = make_user(name="가"), make_user(name="나")
    assert client.post(f"/api/users/{a.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(ceo)).status_code == 201
    r = client.post(f"/api/users/{b.id}/nfc-cards", json={"uid": "0b9f515d"}, headers=auth_headers(ceo))
    assert r.status_code == 409 and "가" in r.json()["detail"]


def test_invalid_uid_is_rejected(client, ceo, make_user, auth_headers):
    emp = make_user()
    assert client.post(f"/api/users/{emp.id}/nfc-cards", json={"uid": "ZZZZ"}, headers=auth_headers(ceo)).status_code == 422
    assert client.post(f"/api/users/{emp.id}/nfc-cards", json={"uid": "0B9F"}, headers=auth_headers(ceo)).status_code == 422


def test_card_limit_per_user(client, ceo, make_user, auth_headers):
    emp = make_user()
    for i in range(5):
        assert client.post(f"/api/users/{emp.id}/nfc-cards", json={"uid": f"0000000{i}"}, headers=auth_headers(ceo)).status_code == 201
    assert client.post(f"/api/users/{emp.id}/nfc-cards", json={"uid": "00000009"}, headers=auth_headers(ceo)).status_code == 400


def test_unknown_user_or_card_is_404(client, ceo, make_user, auth_headers):
    a, b = make_user(), make_user()
    assert client.post("/api/users/999999/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(ceo)).status_code == 404
    card = client.post(f"/api/users/{a.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(ceo)).json()
    # 다른 직원 경로로는 그 카드를 건드릴 수 없다
    assert client.put(f"/api/users/{b.id}/nfc-cards/{card['id']}/deactivate", headers=auth_headers(ceo)).status_code == 404
    assert client.delete(f"/api/users/{b.id}/nfc-cards/{card['id']}", headers=auth_headers(ceo)).status_code == 404


def test_deactivate_keeps_number_reserved_and_delete_frees_it(client, db, ceo, make_user, auth_headers):
    a, b = make_user(), make_user()
    card = client.post(f"/api/users/{a.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(ceo)).json()
    r = client.put(f"/api/users/{a.id}/nfc-cards/{card['id']}/deactivate", headers=auth_headers(ceo))
    assert r.status_code == 200 and r.json()["is_active"] is False and r.json()["deactivated_at"]
    # 사용 중지된 카드도 번호는 남아 있어 다른 직원에게 바로 등록되지 않는다
    assert client.post(f"/api/users/{b.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(ceo)).status_code == 409
    assert client.delete(f"/api/users/{a.id}/nfc-cards/{card['id']}", headers=auth_headers(ceo)).status_code == 204
    assert client.post(f"/api/users/{b.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(ceo)).status_code == 201
    actions = [log.action for log in db.query(AuditLog).filter(AuditLog.entity_type == "nfc_card").order_by(AuditLog.id)]
    assert actions == ["nfc_card_registered", "nfc_card_deactivated", "nfc_card_deleted", "nfc_card_registered"]


def test_card_api_permissions(client, make_user, auth_headers):
    employee = make_user()
    site_admin = make_user(role=UserRole.site_admin)
    target = make_user()
    assert client.get(f"/api/users/{target.id}/nfc-cards", headers=auth_headers(employee)).status_code == 403
    assert client.post(f"/api/users/{target.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(employee)).status_code == 403
    assert client.get(f"/api/users/{target.id}/nfc-cards").status_code == 401
    # 사이트 관리자는 직원 관리 권한과 같게 카드도 등록할 수 있다
    assert client.post(f"/api/users/{target.id}/nfc-cards", json={"uid": "0B9F515D"}, headers=auth_headers(site_admin)).status_code == 201


def test_deleting_user_cascades_cards(db, make_user):
    emp = make_user()
    db.add(NfcCard(user_id=emp.id, uid_hmac="h" * 64, uid_last4="515D", label=""))
    db.flush()
    db.delete(emp)
    db.flush()
    assert db.query(NfcCard).count() == 0


# ── 기기 등록·승인 API ────────────────────────────────────────────

def test_register_device_is_public_pending_and_idempotent(client, db):
    r = client.post("/api/devices/register", json={"name": "사무실 PC", "public_key": KEY_A})
    assert r.status_code == 200 and r.json() == {"status": "pending"}
    again = client.post("/api/devices/register", json={"name": "다른 이름", "public_key": KEY_A.upper()})
    assert again.json() == {"status": "pending"}
    assert db.query(ClientDevice).count() == 1
    d = db.query(ClientDevice).one()
    assert d.name == "사무실 PC" and d.last_seen_at is not None  # 이름은 처음 값 그대로
    assert [log.action for log in db.query(AuditLog).filter(AuditLog.entity_type == "device")] == ["device_registered"]


@pytest.mark.parametrize("key", ["", "abc", "z" * 64, "a" * 63, "a" * 65])
def test_register_device_rejects_bad_key(client, key):
    assert client.post("/api/devices/register", json={"name": "PC", "public_key": key}).status_code == 422


def test_register_device_rejects_blank_name(client):
    assert client.post("/api/devices/register", json={"name": "   ", "public_key": KEY_A}).status_code == 422


def test_pending_devices_are_capped(client, db):
    for i in range(20):
        assert client.post("/api/devices/register", json={"name": f"PC{i}", "public_key": f"{i:02x}" * 32}).status_code == 200
    assert client.post("/api/devices/register", json={"name": "넘침", "public_key": KEY_A}).status_code == 429
    # 이미 등록된 기기가 상태를 묻는 것은 상한과 무관하다
    assert client.post("/api/devices/register", json={"name": "PC0", "public_key": "00" * 32}).status_code == 200


def test_approve_flow_and_status_seen_by_app(client, db, ceo, auth_headers):
    client.post("/api/devices/register", json={"name": "사무실 PC", "public_key": KEY_A})
    device = db.query(ClientDevice).one()

    listed = client.get("/api/devices", headers=auth_headers(ceo)).json()
    assert listed[0]["status"] == "pending" and listed[0]["public_key_short"] == "A1A1A1A1"
    assert "public_key" not in listed[0]

    r = client.put(f"/api/devices/{device.id}/approve", headers=auth_headers(ceo))
    assert r.status_code == 200 and r.json()["status"] == "approved" and r.json()["approved_by"] == ceo.id
    assert r.json()["approved_by_name"] == ceo.name
    assert client.post("/api/devices/register", json={"name": "x", "public_key": KEY_A}).json() == {"status": "approved"}

    assert client.put(f"/api/devices/{device.id}/revoke", headers=auth_headers(ceo)).json()["status"] == "revoked"
    assert client.post("/api/devices/register", json={"name": "x", "public_key": KEY_A}).json() == {"status": "revoked"}
    actions = [log.action for log in db.query(AuditLog).filter(AuditLog.entity_type == "device").order_by(AuditLog.id)]
    assert actions == ["device_registered", "device_approved", "device_revoked"]


def test_revoked_device_cannot_be_reapproved(client, db, ceo, auth_headers):
    client.post("/api/devices/register", json={"name": "PC", "public_key": KEY_A})
    d = db.query(ClientDevice).one()
    client.put(f"/api/devices/{d.id}/approve", headers=auth_headers(ceo))
    client.put(f"/api/devices/{d.id}/revoke", headers=auth_headers(ceo))
    assert client.put(f"/api/devices/{d.id}/approve", headers=auth_headers(ceo)).status_code == 400


def test_rename_and_delete_rules(client, db, ceo, auth_headers):
    client.post("/api/devices/register", json={"name": "PC", "public_key": KEY_A})
    client.post("/api/devices/register", json={"name": "PC2", "public_key": KEY_B})
    a, b = db.query(ClientDevice).order_by(ClientDevice.id).all()
    assert client.put(f"/api/devices/{a.id}", json={"name": " 영업팀 PC "}, headers=auth_headers(ceo)).json()["name"] == "영업팀 PC"
    assert client.put(f"/api/devices/{a.id}", json={"name": "   "}, headers=auth_headers(ceo)).status_code == 400
    client.put(f"/api/devices/{a.id}/approve", headers=auth_headers(ceo))
    assert client.delete(f"/api/devices/{a.id}", headers=auth_headers(ceo)).status_code == 400  # 사용 중인 기기는 먼저 중지
    assert client.delete(f"/api/devices/{b.id}", headers=auth_headers(ceo)).status_code == 204  # 대기 요청은 거절(삭제)
    assert client.delete("/api/devices/999999", headers=auth_headers(ceo)).status_code == 404


def test_device_admin_api_is_ceo_only(client, db, make_user, auth_headers):
    client.post("/api/devices/register", json={"name": "PC", "public_key": KEY_A})
    d = db.query(ClientDevice).one()
    employee = make_user()
    site_admin = make_user(role=UserRole.site_admin)
    for who in (employee, site_admin):
        h = auth_headers(who)
        assert client.get("/api/devices", headers=h).status_code == 403
        assert client.put(f"/api/devices/{d.id}/approve", headers=h).status_code == 403
        assert client.put(f"/api/devices/{d.id}/revoke", headers=h).status_code == 403
        assert client.delete(f"/api/devices/{d.id}", headers=h).status_code == 403
    assert client.get("/api/devices").status_code == 401
    assert client.put(f"/api/devices/{d.id}/approve").status_code == 401
    assert db.query(ClientDevice).one().status == "pending"
