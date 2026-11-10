"""모바일 푸시(FCM): 기기 토큰 API, 발송 서비스(FCM 은 대체), 알림 커밋 뒤 발송 연결."""
import pytest

from app.models.device_token import DeviceToken
from app.models.notification import Notification
from app.services import push

TOKEN_A = "a" * 40
TOKEN_B = "b" * 40


@pytest.fixture(autouse=True)
def _fcm_off_by_default(monkeypatch):
    monkeypatch.setattr(push, "_ready", False)


def _register(client, h, token=TOKEN_A, **over):
    return client.post("/api/push/devices", headers=h, json={"token": token, "platform": "ios", "device_name": "아이폰", "app_version": "0.72.52", **over})


def test_register_update_and_account_switch(client, db, make_user, auth_headers):
    a, b = make_user(name="직원A"), make_user(name="직원B")
    assert _register(client, auth_headers(a)).status_code == 204
    assert _register(client, auth_headers(a), device_name="새 이름").status_code == 204  # 같은 토큰은 갱신 (중복 행 없음)
    db.expire_all()
    rows = db.query(DeviceToken).all()
    assert len(rows) == 1 and rows[0].user_id == a.id and rows[0].device_name == "새 이름"

    assert _register(client, auth_headers(b)).status_code == 204  # 같은 폰에서 B 로 로그인하면 주인이 B 로 바뀐다
    db.expire_all()
    assert db.query(DeviceToken).one().user_id == b.id
    assert client.post("/api/push/devices", json={"token": TOKEN_A}).status_code == 401
    assert _register(client, auth_headers(a), token="short").status_code == 422


def test_unregister_only_own_token(client, db, make_user, auth_headers):
    a, b = make_user(name="직원A"), make_user(name="직원B")
    _register(client, auth_headers(a), TOKEN_A)
    assert client.request("DELETE", "/api/push/devices", headers=auth_headers(b), json={"token": TOKEN_A}).status_code == 204  # 남의 토큰은 지워지지 않는다
    db.expire_all()
    assert db.query(DeviceToken).count() == 1
    assert client.request("DELETE", "/api/push/devices", headers=auth_headers(a), json={"token": TOKEN_A}).status_code == 204
    db.expire_all()
    assert db.query(DeviceToken).count() == 0


def test_send_push_skips_when_disabled_or_no_tokens(db, make_user, monkeypatch):
    user = make_user(name="직원")
    called = []
    monkeypatch.setattr(push, "_send_each", lambda m: called.append(m) or [None] * len(m))
    assert push.send_push(db, user.id, "제목", "본문") == 0  # FCM 꺼짐
    monkeypatch.setattr(push, "_ready", True)
    assert push.send_push(db, user.id, "제목", "본문") == 0  # 등록된 기기 없음
    assert called == []


def test_send_push_deletes_invalid_tokens_and_survives_errors(db, make_user, monkeypatch):
    user = make_user(name="직원")
    db.add_all([DeviceToken(user_id=user.id, token=TOKEN_A, platform="ios"), DeviceToken(user_id=user.id, token=TOKEN_B, platform="ios")])
    db.commit()
    monkeypatch.setattr(push, "_ready", True)
    monkeypatch.setattr(push, "_build_message", lambda row, *a: row.token)

    class Gone(Exception):
        pass

    monkeypatch.setattr(push, "_is_invalid_token", lambda e: isinstance(e, Gone))
    monkeypatch.setattr(push, "_send_each", lambda msgs: [Gone() if m == TOKEN_A else None for m in msgs])
    assert push.send_push(db, user.id, "제목", "본문", "/documents?open=1") == 1  # B 는 성공, A 는 무효 토큰
    db.expire_all()
    assert [r.token for r in db.query(DeviceToken).all()] == [TOKEN_B]

    def boom(msgs):
        raise RuntimeError("fcm down")

    monkeypatch.setattr(push, "_send_each", boom)
    assert push.send_push(db, user.id, "제목", "본문") == 0  # 예외가 호출한 쪽으로 번지지 않는다
    db.expire_all()
    assert db.query(DeviceToken).count() == 1


def test_push_text_has_no_sensitive_details():
    assert push.push_text("견적서(대성RF) 결재 요청")[0] == "결재 요청이 도착했습니다"
    assert push.push_text("연차 신청 승인")[0] == "결재가 승인되었습니다"
    assert push.push_text("발주서(대성RF) 반려")[0] == "결재가 반려되었습니다"
    title, body = push.push_text("견적서(대성RF) 결재 요청")
    assert "대성RF" not in title + body


def test_committed_notification_triggers_push_but_rollback_does_not(db, make_user, monkeypatch):
    user = make_user(name="직원")
    db.commit()
    sent = []
    monkeypatch.setattr(push, "_ready", True)
    monkeypatch.setattr(push, "send_in_background", lambda items: sent.extend(items))

    db.add(Notification(user_id=user.id, title="견적서(A) 결재 요청", message="m", link="/documents?open=3"))
    db.rollback()
    db.commit()
    assert sent == []  # 롤백된 알림은 보내지 않는다

    db.add(Notification(user_id=user.id, title="견적서(A) 결재 요청", message="m", link="/documents?open=3"))
    db.commit()
    assert sent == [(user.id, "견적서(A) 결재 요청", "/documents?open=3")]


# ── 메신저 푸시 ─────────────────────────────────────────────────────

def _chat(client, h, member_ids, kind="direct", title=None):
    res = client.post("/api/messenger/conversations", headers=h, json={"kind": kind, "member_ids": member_ids, "title": title})
    assert res.status_code in (200, 201), res.text
    return res.json()["id"]


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(push, "_ready", True)
    monkeypatch.setattr(push, "send_ready_in_background", lambda items: sent.extend(items))
    return sent


def test_messenger_message_pushes_to_other_members_without_content(client, make_user, auth_headers, monkeypatch):
    a, b = make_user(name="보낸이"), make_user(name="받는이")
    sent = _capture(monkeypatch)
    cid = _chat(client, auth_headers(a), [b.id])
    assert client.post(f"/api/messenger/conversations/{cid}/messages", headers=auth_headers(a), json={"body": "비밀 견적 3억"}).status_code == 201
    assert sent == [(b.id, "보낸이", "새 메시지가 도착했습니다", f"/m/messenger/{cid}")]  # 보낸 사람은 제외, 내용은 노출하지 않는다


def test_messenger_push_skips_muted_and_phone_viewers_and_shows_group_title(client, make_user, auth_headers, monkeypatch):
    from app.core.realtime import hub

    a, b, c, d = (make_user(name=n) for n in ("보낸이", "끈사람", "접속중", "받는이"))
    sent = _capture(monkeypatch)
    cid = _chat(client, auth_headers(a), [b.id, c.id, d.id], kind="group", title="개발팀")
    assert client.put(f"/api/messenger/conversations/{cid}/mute", headers=auth_headers(b), json={"muted": True}).status_code == 200
    monkeypatch.setattr(hub, "is_online_on_phone", lambda uid: uid == c.id)  # 폰 화면으로 보고 있는 사람에게는 푸시하지 않는다
    assert client.post(f"/api/messenger/conversations/{cid}/messages", headers=auth_headers(a), json={"body": "안녕"}).status_code == 201
    assert sent == [(d.id, "개발팀", "보낸이: 새 메시지가 도착했습니다", f"/m/messenger/{cid}")]


def test_messenger_push_preview_setting_and_disabled(client, make_user, auth_headers, monkeypatch):
    from app.config import settings

    a, b = make_user(name="보낸이"), make_user(name="받는이")
    cid = _chat(client, auth_headers(a), [b.id])
    sent = []
    monkeypatch.setattr(push, "send_ready_in_background", lambda items: sent.extend(items))
    client.post(f"/api/messenger/conversations/{cid}/messages", headers=auth_headers(a), json={"body": "꺼짐"})
    assert sent == []  # FCM 이 꺼져 있으면 아무것도 하지 않는다

    monkeypatch.setattr(push, "_ready", True)
    monkeypatch.setattr(settings, "fcm_messenger_preview", True)
    client.post(f"/api/messenger/conversations/{cid}/messages", headers=auth_headers(a), json={"body": "내용 미리보기"})
    assert sent[-1][2] == "내용 미리보기"


# ── 앱 아이콘 숫자(배지) ────────────────────────────────────────────

def test_send_badge_updates_every_device_and_deletes_invalid_tokens(db, make_user, monkeypatch):
    user = make_user(name="직원")
    db.add_all([DeviceToken(user_id=user.id, token=TOKEN_A, platform="ios"), DeviceToken(user_id=user.id, token=TOKEN_B, platform="ios")])
    db.commit()
    monkeypatch.setattr(push, "_build_badge_message", lambda row, badge: (row.token, badge))

    class Gone(Exception):
        pass

    monkeypatch.setattr(push, "_is_invalid_token", lambda e: isinstance(e, Gone))
    seen = []
    monkeypatch.setattr(push, "_send_each", lambda msgs: seen.extend(msgs) or [Gone() if m[0] == TOKEN_A else None for m in msgs])
    assert push.send_badge(db, user.id, 0) == 0  # FCM 꺼짐
    monkeypatch.setattr(push, "_ready", True)
    assert push.send_badge(db, user.id, 0) == 1
    assert seen == [(TOKEN_A, 0), (TOKEN_B, 0)]
    db.expire_all()
    assert [r.token for r in db.query(DeviceToken).all()] == [TOKEN_B]


def test_reading_notifications_and_messages_syncs_badge(client, db, make_user, auth_headers, monkeypatch):
    a, b = make_user(name="보낸이"), make_user(name="받는이")
    synced = []
    monkeypatch.setattr(push, "sync_badge_in_background", lambda uid: synced.append(uid))
    n = Notification(user_id=b.id, title="결재 요청", message="m", link=None)
    db.add(n)
    db.commit()
    assert client.put(f"/api/notifications/{n.id}/read", headers=auth_headers(b)).status_code == 200
    assert client.put("/api/notifications/read-all", headers=auth_headers(b)).status_code == 204
    assert synced == [b.id, b.id]

    cid = _chat(client, auth_headers(a), [b.id])
    mid = client.post(f"/api/messenger/conversations/{cid}/messages", headers=auth_headers(a), json={"body": "안녕"}).json()["id"]
    synced.clear()
    assert client.put(f"/api/messenger/conversations/{cid}/read", headers=auth_headers(b), json={"message_id": mid}).status_code == 200
    assert synced == [b.id]  # 메신저를 읽으면 읽은 사람 폰의 숫자를 맞춘다
