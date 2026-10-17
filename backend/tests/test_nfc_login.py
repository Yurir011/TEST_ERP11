"""NFC 카드 로그인: 확인값(nonce) 보관, 서명 확인, 로그인 API, 카드·기기 중지 시 토큰 무효화."""
from datetime import datetime, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.config import settings
from app.core.nfc_challenges import MAX_OUTSTANDING, ChallengeStore
from app.models.audit_log import AuditLog
from app.models.client_device import ClientDevice
from app.models.nfc_card import NfcCard
from app.routers import nfc_auth
from app.services.nfc import uid_hash, uid_last4
from app.services.nfc_signature import login_message, verify_login_signature

UID = "0B9F515D"

# 데스크톱 앱(Node)이 같은 형식으로 만든 서명. 서버가 앱이 실제로 만드는 서명을 확인할 수 있는지(언어 간 호환) 보는 고정 값.
NODE_VECTOR = {
    "pub": "4fa36ce8a993213bd9eeb3eadc178a43de9707406e1021e5d400fe62938f1e8c",
    "nonce": "0123456789abcdef0123456789abcdef",
    "uid": "0B9F515D",
    "sig": "a6828e4a61f5ccc1e5e825aa5197a87cd80d927be460eae73bf34ff498df6a36b38cd868824ed758655aa4b24c81ac65d663c59cb2a7f207918f1eed71d9e001",
}


# ── 확인값(nonce) 보관 ────────────────────────────────────────────

class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_challenge_is_single_use():
    store = ChallengeStore(60, clock=Clock())
    n = store.issue("keyA")
    assert store.consume(n, "keyA") is True
    assert store.consume(n, "keyA") is False  # 같은 값은 다시 못 쓴다


def test_challenge_expires():
    clock = Clock()
    store = ChallengeStore(60, clock=clock)
    n = store.issue("keyA")
    clock.t += 61
    assert store.consume(n, "keyA") is False


def test_challenge_is_bound_to_device_and_wrong_try_burns_it():
    store = ChallengeStore(60, clock=Clock())
    n = store.issue("keyA")
    assert store.consume(n, "keyB") is False
    assert store.consume(n, "keyA") is False  # 틀린 기기가 한 번 시도했으면 이미 지워졌다


def test_challenge_unknown_and_capped():
    store = ChallengeStore(60, clock=Clock())
    assert store.consume("nope", "keyA") is False
    first = store.issue("keyA")
    for _ in range(MAX_OUTSTANDING):
        store.issue("keyA")
    assert len(store) <= MAX_OUTSTANDING
    assert store.consume(first, "keyA") is False  # 상한을 넘으면 가장 오래된 것부터 버린다


def test_challenge_purges_expired_on_issue():
    clock = Clock()
    store = ChallengeStore(60, clock=clock)
    for _ in range(5):
        store.issue("keyA")
    clock.t += 120
    store.issue("keyA")
    assert len(store) == 1


# ── 서명 확인 ────────────────────────────────────────────────────

def test_server_accepts_signature_made_by_the_desktop_app():
    v = NODE_VECTOR
    assert verify_login_signature(v["pub"], v["nonce"], v["uid"], v["sig"]) is True


@pytest.mark.parametrize("field, value", [("nonce", "f" * 32), ("uid", "0B9F625D")])
def test_signature_binds_nonce_and_uid(field, value):
    v = {**NODE_VECTOR, field: value}
    assert verify_login_signature(v["pub"], v["nonce"], v["uid"], v["sig"]) is False


def test_signature_rejects_garbage_without_raising():
    v = NODE_VECTOR
    assert verify_login_signature("zz", v["nonce"], v["uid"], v["sig"]) is False
    assert verify_login_signature(v["pub"], v["nonce"], v["uid"], "00" * 64) is False
    assert verify_login_signature(v["pub"], v["nonce"], v["uid"], "not hex") is False
    assert verify_login_signature("00" * 32, v["nonce"], v["uid"], v["sig"]) is False


# ── 로그인 API ───────────────────────────────────────────────────

class FakeApp:
    """데스크톱 앱 흉내: 자기 키로 nonce 에 서명한다."""

    def __init__(self):
        self.key = Ed25519PrivateKey.generate()
        self.pub = self.key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    def sign(self, nonce: str, uid: str) -> str:
        return self.key.sign(login_message(nonce, uid)).hex()


@pytest.fixture()
def app_device(db):
    dev = FakeApp()
    db.add(ClientDevice(name="사무실 PC", public_key=dev.pub, status="approved"))
    db.flush()
    return dev


@pytest.fixture()
def employee_with_card(db, make_user):
    user = make_user(name="홍길동")
    card = NfcCard(user_id=user.id, uid_hmac=uid_hash(UID), uid_last4=uid_last4(UID), label="사원증")
    db.add(card)
    db.flush()
    return user, card


def tap(client, dev, uid=UID, *, sign_uid=None, signer=None, nonce=None):
    """카드를 댄 것처럼 challenge → login 을 한다. 응답(login)을 돌려준다."""
    if nonce is None:
        ch = client.post("/api/auth/nfc/challenge", json={"public_key": dev.pub})
        assert ch.status_code == 200, ch.text
        nonce = ch.json()["nonce"]
    sig = (signer or dev).sign(nonce, sign_uid or uid)
    return client.post("/api/auth/nfc/login", json={"public_key": dev.pub, "nonce": nonce, "uid": uid, "signature": sig})


def audit(db, action):
    return [log for log in db.query(AuditLog).filter(AuditLog.action == action).order_by(AuditLog.id)]


def test_card_login_success_flow(client, db, app_device, employee_with_card):
    user, card = employee_with_card
    r = tap(client, app_device)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == user.email

    claims = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    assert claims["amr"] == "nfc" and claims["cid"] == card.id and claims["did"] == db.query(ClientDevice).one().id
    remaining = claims["exp"] - datetime.now(timezone.utc).timestamp()
    assert settings.nfc_token_expire_minutes * 60 - 120 < remaining <= settings.nfc_token_expire_minutes * 60

    db.refresh(card)
    assert card.last_used_at is not None
    (log,) = audit(db, "nfc_login_success")
    assert user.name in log.summary and "515D" in log.summary and UID not in log.summary


def test_lowercase_and_separated_card_number_is_accepted(client, app_device, employee_with_card):
    ch = client.post("/api/auth/nfc/challenge", json={"public_key": app_device.pub}).json()
    r = client.post(
        "/api/auth/nfc/login",
        json={"public_key": app_device.pub, "nonce": ch["nonce"], "uid": "0b:9f:51:5d", "signature": app_device.sign(ch["nonce"], UID)},
    )
    assert r.status_code == 200


def test_pending_or_unknown_or_revoked_device_gets_nothing(client, db, employee_with_card):
    for status_name in ("pending", "revoked", None):
        dev = FakeApp()
        if status_name:
            db.add(ClientDevice(name=f"PC-{status_name}", public_key=dev.pub, status=status_name))
            db.flush()
        assert client.post("/api/auth/nfc/challenge", json={"public_key": dev.pub}).status_code == 403
        # nonce 를 못 받았어도 임의 값으로 로그인을 시도할 수 없다
        r = tap(client, dev, nonce="a" * 32)
        assert r.status_code == 403 and "승인" in r.json()["detail"]


def test_nonce_cannot_be_replayed(client, app_device, employee_with_card):
    ch = client.post("/api/auth/nfc/challenge", json={"public_key": app_device.pub}).json()
    assert tap(client, app_device, nonce=ch["nonce"]).status_code == 200
    again = tap(client, app_device, nonce=ch["nonce"])  # 가로챈 요청을 그대로 다시 보내도
    assert again.status_code == 401


def test_expired_nonce_is_rejected_without_counting_as_failure(client, app_device, employee_with_card, monkeypatch):
    clock = Clock()
    monkeypatch.setattr(nfc_auth.challenges, "_clock", clock)
    ch = client.post("/api/auth/nfc/challenge", json={"public_key": app_device.pub}).json()
    clock.t += settings.nfc_challenge_ttl_seconds + 1
    r = tap(client, app_device, nonce=ch["nonce"])
    assert r.status_code == 401 and "다시 대세요" in r.json()["detail"]
    for _ in range(10):  # 만료는 실패 횟수에 들어가지 않으므로 잠기지 않는다
        tap(client, app_device, nonce="b" * 32)
    clock.t += 0
    assert tap(client, app_device).status_code == 200


def test_nonce_issued_to_another_device_is_useless(client, db, app_device, employee_with_card):
    other = FakeApp()
    db.add(ClientDevice(name="다른 PC", public_key=other.pub, status="approved"))
    db.flush()
    ch = client.post("/api/auth/nfc/challenge", json={"public_key": other.pub}).json()
    r = tap(client, app_device, nonce=ch["nonce"])
    assert r.status_code == 401


def test_bad_signature_is_rejected(client, db, app_device, employee_with_card):
    # 다른 키로 서명 (공개키만 아는 사람이 흉내 내는 경우)
    r = tap(client, app_device, signer=FakeApp())
    assert r.status_code == 401 and "기기 인증" in r.json()["detail"]
    # 다른 카드 번호에 대한 서명을 붙여 보내도 소용없다 (서명이 카드 번호에 묶여 있다)
    r = tap(client, app_device, sign_uid="0B9F625D")
    assert r.status_code == 401
    assert [log.summary for log in audit(db, "nfc_login_failed")][0].startswith("카드 로그인 실패: 서명 불일치")


def test_unregistered_card_is_rejected_and_audit_has_only_last4(client, db, app_device):
    r = tap(client, app_device, uid="04A1B2C3D4E5F6")
    assert r.status_code == 401 and r.json()["detail"] == nfc_auth.BAD_CARD
    (log,) = audit(db, "nfc_login_failed")
    assert "E5F6" in log.summary and "04A1B2C3D4E5F6" not in log.summary
    assert "04A1B2C3D4E5F6" not in r.text


def test_deactivated_card_and_inactive_user_are_rejected(client, db, app_device, employee_with_card):
    user, card = employee_with_card
    card.is_active = False
    db.flush()
    assert tap(client, app_device).status_code == 401
    card.is_active = True
    user.is_active = False
    db.flush()
    r = tap(client, app_device)
    assert r.status_code == 403 and "비활성" in r.json()["detail"]


def test_repeated_failures_lock_the_device_even_for_a_valid_card(client, db, app_device, employee_with_card):
    for _ in range(settings.login_max_failures):
        assert tap(client, app_device, uid="04A1B2C3").status_code == 401
    r = tap(client, app_device)  # 이제는 맞는 카드도 잠금이 풀릴 때까지 안 된다
    assert r.status_code == 429 and "Retry-After" in r.headers and "분" in r.json()["detail"]
    assert audit(db, "nfc_login_blocked")


def test_lock_is_per_device(client, db, app_device, employee_with_card):
    for _ in range(settings.login_max_failures):
        tap(client, app_device, uid="04A1B2C3")
    # 같은 접속 주소(테스트에서는 모두 같다)의 한도는 훨씬 느슨하므로 다른 기기는 영향을 받지 않는다
    other = FakeApp()
    db.add(ClientDevice(name="다른 PC", public_key=other.pub, status="approved"))
    db.flush()
    assert tap(client, other).status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {"public_key": "zz", "nonce": "a" * 32, "uid": UID, "signature": "0" * 128},
        {"public_key": "a" * 64, "nonce": "short", "uid": UID, "signature": "0" * 128},
        {"public_key": "a" * 64, "nonce": "a" * 32, "uid": "XYZ", "signature": "0" * 128},
        {"public_key": "a" * 64, "nonce": "a" * 32, "uid": UID, "signature": "0" * 10},
        {"public_key": "a" * 64, "nonce": "a" * 32, "uid": UID},
    ],
)
def test_malformed_login_requests_are_422(client, body):
    assert client.post("/api/auth/nfc/login", json=body).status_code == 422


# ── 카드·기기를 중지하면 이미 받은 토큰도 막힌다 ───────────────────

def _login_token(client, dev):
    return tap(client, dev).json()["access_token"]


def test_token_stops_working_when_card_is_deactivated(client, db, app_device, employee_with_card):
    _, card = employee_with_card
    headers = {"Authorization": f"Bearer {_login_token(client, app_device)}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    card.is_active = False
    db.flush()
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 401 and "다시 로그인" in r.json()["detail"]


def test_token_stops_working_when_card_is_deleted_or_device_revoked(client, db, app_device, employee_with_card):
    _, card = employee_with_card
    headers = {"Authorization": f"Bearer {_login_token(client, app_device)}"}
    db.query(ClientDevice).update({"status": "revoked"})
    db.flush()
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    db.query(ClientDevice).update({"status": "approved"})
    db.flush()
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    db.delete(card)
    db.flush()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_password_login_tokens_are_not_affected(client, db, make_user, auth_headers, app_device):
    user = make_user()
    assert client.get("/api/auth/me", headers=auth_headers(user)).status_code == 200


def test_forged_nfc_claims_do_not_help(client, db, make_user):
    """amr 만 흉내 낸 토큰(기기·카드 번호가 없거나 틀림)은 거절된다."""
    from app.core.security import create_access_token

    user = make_user()
    for claims in ({"amr": "nfc"}, {"amr": "nfc", "did": 999999, "cid": 999999}, {"amr": "nfc", "did": "1", "cid": "1"}):
        token = create_access_token(user.email, extra_claims=claims)
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
