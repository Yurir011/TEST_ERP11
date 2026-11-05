"""패스키(WebAuthn) 등록·로그인 테스트.

브라우저와 기기를 흉내 내는 가짜 인증기(FakeAuthenticator)로 실제 서명 검증(py_webauthn)을 통과시킨다.
"""
import base64
import hashlib
import json
import os
import struct

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import settings
from app.core.login_throttle import LoginThrottle, ThrottleRule
from app.models.passkey import PasskeyCredential
from app.models.user import UserRole
from app.routers import passkeys as passkeys_router

RP_ID = "erp.test"
ORIGIN = "https://erp.test"


def b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class FakeAuthenticator:
    """폰의 지문 인식 기능을 흉내 낸다: 키 쌍을 만들고, 등록 응답과 로그인 서명을 브라우저가 보내는 모양으로 만든다."""

    def __init__(self, user_id: int, rp_id: str = RP_ID):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.user_id = user_id
        self.rp_id = rp_id

    def _cose_key(self) -> bytes:
        n = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    def create(self, options: dict, origin: str = ORIGIN) -> dict:
        client_data = json.dumps({"type": "webauthn.create", "challenge": options["challenge"], "origin": origin, "crossOrigin": False}).encode()
        rp_hash = hashlib.sha256(self.rp_id.encode()).digest()
        flags = 0x01 | 0x04 | 0x40  # 사용자 존재 + 사용자 확인(지문) + 인증 데이터 포함
        auth_data = rp_hash + bytes([flags]) + struct.pack(">I", 0) + b"\x00" * 16 + struct.pack(">H", len(self.credential_id)) + self.credential_id + self._cose_key()
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64u(self.credential_id), "rawId": b64u(self.credential_id), "type": "public-key", "clientExtensionResults": {},
            "response": {"clientDataJSON": b64u(client_data), "attestationObject": b64u(attestation)},
        }

    def get(self, options: dict, sign_count: int, origin: str = ORIGIN, user_verified: bool = True) -> dict:
        client_data = json.dumps({"type": "webauthn.get", "challenge": options["challenge"], "origin": origin, "crossOrigin": False}).encode()
        rp_hash = hashlib.sha256(self.rp_id.encode()).digest()
        auth_data = rp_hash + bytes([0x01 | (0x04 if user_verified else 0)]) + struct.pack(">I", sign_count)
        signature = self.key.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
        return {
            "id": b64u(self.credential_id), "rawId": b64u(self.credential_id), "type": "public-key", "clientExtensionResults": {},
            "response": {"clientDataJSON": b64u(client_data), "authenticatorData": b64u(auth_data), "signature": b64u(signature), "userHandle": b64u(str(self.user_id).encode())},
        }


@pytest.fixture(autouse=True)
def _passkey_settings(monkeypatch):
    monkeypatch.setattr(settings, "webauthn_rp_id", RP_ID)
    monkeypatch.setattr(settings, "webauthn_origins", [ORIGIN])
    passkeys_router.challenges.clear()
    monkeypatch.setattr(passkeys_router, "passkey_throttle", LoginThrottle(ThrottleRule(3, 600, 300), ThrottleRule(3, 600, 300)))


@pytest.fixture()
def employee(make_user):
    return make_user(name="이도현")


def _register(client, headers, user, name="이도현의 iPhone", origin=ORIGIN):
    authn = FakeAuthenticator(user.id)
    opts = client.post("/api/passkeys/register/options", headers=headers)
    assert opts.status_code == 200, opts.text
    body = opts.json()
    res = client.post("/api/passkeys/register/verify", headers=headers, json={"challenge_id": body["challenge_id"], "credential": authn.create(body["options"], origin), "name": name})
    return authn, res


def _login_options(client):
    res = client.post("/api/passkeys/login/options")
    assert res.status_code == 200, res.text
    return res.json()


def _login(client, authn, sign_count=1, **kw):
    opts = _login_options(client)
    return client.post("/api/passkeys/login/verify", json={"challenge_id": opts["challenge_id"], "credential": authn.get(opts["options"], sign_count, **kw)})


# ── 설정 ─────────────────────────────────────────────────────────

def test_status_and_disabled_when_not_configured(client, employee, auth_headers, monkeypatch):
    assert client.get("/api/passkeys/status").json() == {"enabled": True}
    monkeypatch.setattr(settings, "webauthn_rp_id", "")
    assert client.get("/api/passkeys/status").json() == {"enabled": False}
    assert client.post("/api/passkeys/login/options").status_code == 503
    assert client.post("/api/passkeys/register/options", headers=auth_headers(employee)).status_code == 503


# ── 등록 ─────────────────────────────────────────────────────────

def test_register_requires_login(client):
    assert client.post("/api/passkeys/register/options").status_code in (401, 403)
    assert client.get("/api/passkeys").status_code in (401, 403)


def test_register_options_ask_for_built_in_biometrics(client, employee, auth_headers):
    opts = client.post("/api/passkeys/register/options", headers=auth_headers(employee)).json()["options"]
    assert opts["rp"]["id"] == RP_ID
    assert opts["user"]["name"] == employee.email and opts["user"]["displayName"] == "이도현"
    sel = opts["authenticatorSelection"]
    assert sel["authenticatorAttachment"] == "platform" and sel["userVerification"] == "required" and sel["residentKey"] == "required"


def test_register_and_list_and_delete(client, db, employee, auth_headers):
    headers = auth_headers(employee)
    authn, res = _register(client, headers, employee)
    assert res.status_code == 201, res.text
    assert res.json()["name"] == "이도현의 iPhone" and res.json()["last_used_at"] is None

    listed = client.get("/api/passkeys", headers=headers).json()
    assert [p["name"] for p in listed] == ["이도현의 iPhone"]
    assert "public_key" not in listed[0] and "credential_id" not in listed[0]  # 키 정보는 내보내지 않는다

    assert client.delete(f"/api/passkeys/{listed[0]['id']}", headers=headers).status_code == 204
    assert client.get("/api/passkeys", headers=headers).json() == []
    assert db.query(PasskeyCredential).count() == 0


def test_register_rejects_wrong_origin_and_replayed_challenge(client, employee, auth_headers):
    headers = auth_headers(employee)
    _, bad = _register(client, headers, employee, origin="https://evil.test")  # 다른 사이트에서 만든 응답
    assert bad.status_code == 400

    authn = FakeAuthenticator(employee.id)
    body = client.post("/api/passkeys/register/options", headers=headers).json()
    payload = {"challenge_id": body["challenge_id"], "credential": authn.create(body["options"]), "name": "폰"}
    assert client.post("/api/passkeys/register/verify", headers=headers, json=payload).status_code == 201
    assert client.post("/api/passkeys/register/verify", headers=headers, json=payload).status_code == 400  # 같은 확인값 재사용 불가


def test_register_challenge_is_bound_to_the_user_who_asked(client, make_user, employee, auth_headers):
    other = make_user(name="다른직원")
    authn = FakeAuthenticator(employee.id)
    body = client.post("/api/passkeys/register/options", headers=auth_headers(employee)).json()
    res = client.post("/api/passkeys/register/verify", headers=auth_headers(other), json={"challenge_id": body["challenge_id"], "credential": authn.create(body["options"]), "name": "도용"})
    assert res.status_code == 400


def test_register_limit_per_user(client, employee, auth_headers):
    headers = auth_headers(employee)
    for i in range(passkeys_router.MAX_PASSKEYS_PER_USER):
        _, res = _register(client, headers, employee, name=f"기기{i}")
        assert res.status_code == 201, res.text
    assert client.post("/api/passkeys/register/options", headers=headers).status_code == 400


# ── 로그인 ───────────────────────────────────────────────────────

def test_login_with_passkey_returns_working_token(client, db, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    res = _login(client, authn, sign_count=1)
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == employee.email

    pc = db.query(PasskeyCredential).one()
    assert pc.sign_count == 1 and pc.last_used_at is not None
    listed = client.get("/api/passkeys", headers={"Authorization": f"Bearer {token}"}).json()
    assert listed[0]["last_used_at"] is not None


def test_login_challenge_cannot_be_replayed_or_used_for_registration(client, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    opts = _login_options(client)
    payload = {"challenge_id": opts["challenge_id"], "credential": authn.get(opts["options"], 1)}
    assert client.post("/api/passkeys/login/verify", json=payload).status_code == 200
    assert client.post("/api/passkeys/login/verify", json=payload).status_code == 400  # 같은 로그인 응답을 다시 보내도 통하지 않는다

    reg = client.post("/api/passkeys/register/options", headers=auth_headers(employee)).json()
    wrong_use = client.post("/api/passkeys/login/verify", json={"challenge_id": reg["challenge_id"], "credential": authn.get(reg["options"], 2)})
    assert wrong_use.status_code == 400  # 등록용 확인값으로는 로그인할 수 없다


def test_login_fails_for_unknown_passkey_wrong_origin_and_no_user_verification(client, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    assert _login(client, FakeAuthenticator(employee.id)).status_code == 401  # 등록하지 않은 기기
    assert _login(client, authn, origin="https://evil.test").status_code == 401  # 가짜 사이트에서 받은 서명
    assert _login(client, authn, user_verified=False).status_code == 401  # 지문·얼굴 확인 없이 서명


def test_login_rejects_signature_from_a_different_key(client, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    forger = FakeAuthenticator(employee.id)
    forger.credential_id = authn.credential_id  # 식별값은 같지만 개인키는 다른 위조 기기
    assert _login(client, forger).status_code == 401


def test_login_rejects_cloned_authenticator_by_sign_count(client, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    assert _login(client, authn, sign_count=5).status_code == 200
    assert _login(client, authn, sign_count=3).status_code == 401  # 횟수가 거꾸로 가면 복제된 기기로 본다


def test_login_blocks_inactive_user(client, db, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    employee.is_active = False
    db.flush()
    assert _login(client, authn).status_code == 403


def test_repeated_failures_lock_the_address(client, employee, auth_headers):
    authn, _ = _register(client, auth_headers(employee), employee)
    stranger = FakeAuthenticator(employee.id)
    for _ in range(3):
        assert _login(client, stranger).status_code == 401
    locked = _login(client, authn)  # 맞는 기기여도 잠금이 풀릴 때까지 막힌다
    assert locked.status_code == 429 and "Retry-After" in locked.headers


# ── 삭제·관리자 ──────────────────────────────────────────────────

def test_cannot_delete_someone_elses_passkey(client, make_user, employee, auth_headers):
    other = make_user(name="다른직원")
    _register(client, auth_headers(employee), employee)
    pid = client.get("/api/passkeys", headers=auth_headers(employee)).json()[0]["id"]
    assert client.delete(f"/api/passkeys/{pid}", headers=auth_headers(other)).status_code == 404


def test_admin_can_list_and_delete_employee_passkeys(client, db, make_user, employee, auth_headers):
    admin = make_user(role=UserRole.admin, name="대표")
    authn, _ = _register(client, auth_headers(employee), employee)
    pid = client.get("/api/passkeys", headers=auth_headers(employee)).json()[0]["id"]

    assert client.get(f"/api/passkeys/admin/{employee.id}", headers=auth_headers(employee)).status_code == 403  # 일반 직원은 불가
    listed = client.get(f"/api/passkeys/admin/{employee.id}", headers=auth_headers(admin))
    assert listed.status_code == 200 and [p["id"] for p in listed.json()] == [pid]

    assert client.delete(f"/api/passkeys/admin/{employee.id}/{pid}", headers=auth_headers(employee)).status_code == 403
    assert client.delete(f"/api/passkeys/admin/{employee.id}/{pid}", headers=auth_headers(admin)).status_code == 204
    assert _login(client, authn).status_code == 401  # 지운 패스키로는 더 이상 로그인할 수 없다
