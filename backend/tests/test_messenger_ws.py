"""메신저 실시간 알림(WebSocket): 인증, 참여자에게만 전달, 다시 확인(ping), 연결 정리."""
from contextlib import nullcontext

import pytest
from starlette.websockets import WebSocketDisconnect

from app.core.realtime import hub
from app.core.security import create_access_token
from app.models.client_device import ClientDevice
from app.models.nfc_card import NfcCard
from app.routers import messenger_ws

BASE = "/api/messenger"


@pytest.fixture(autouse=True)
def _ws_uses_test_session(db, monkeypatch):
    # WebSocket 은 짧게 DB 를 쓸 때 자기 세션을 연다. 테스트에서는 롤백되는 세션을 대신 쓴다.
    monkeypatch.setattr(messenger_ws, "open_session", lambda: nullcontext(db))
    monkeypatch.setattr(messenger_ws, "AUTH_TIMEOUT_SECONDS", 0.5)


@pytest.fixture()
def people(make_user):
    return {"a": make_user(name="가"), "b": make_user(name="나"), "c": make_user(name="다")}


def token_of(user) -> str:
    return create_access_token(user.email)


def connect(client, user, *, token=None):
    """연결해서 인증하고 ready 를 받은 WebSocket 을 돌려준다 (with 문에서 쓴다)."""
    ws_cm = client.websocket_connect("/api/ws")
    ws = ws_cm.__enter__()
    ws.send_json({"type": "auth", "token": token if token is not None else token_of(user)})
    assert ws.receive_json() == {"type": "ready"}
    return ws_cm, ws


def idle(ws):
    """이벤트가 더 쌓여 있지 않은지 확인한다: ping 을 보내 pong 이 바로 오면 앞에 다른 이벤트가 없다."""
    ws.send_json({"type": "ping"})
    return ws.receive_json()


def test_auth_then_ready(client, people):
    cm, ws = connect(client, people["a"])
    try:
        assert hub.is_online(people["a"].id)
        assert idle(ws) == {"type": "pong"}
    finally:
        cm.__exit__(None, None, None)
    assert not hub.is_online(people["a"].id)  # 연결이 끊기면 목록에서 빠진다


@pytest.mark.parametrize("first", [{"type": "auth", "token": "garbage"}, {"type": "auth"}, {"type": "hello"}, {"token": "x"}])
def test_bad_auth_is_closed_with_4401(client, first):
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json(first)
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4401


def test_not_json_or_not_object_is_closed(client, people):
    for raw in ("not json", "[1,2]"):
        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(raw)
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
        assert exc.value.code == 4401


def test_no_auth_message_in_time_is_closed(client):
    with client.websocket_connect("/api/ws") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()  # 아무것도 보내지 않으면 시간이 지나 서버가 끊는다
    assert exc.value.code == 4401


def test_token_in_url_is_not_accepted(client, people):
    """주소에 토큰을 넣어도 인증되지 않는다 (인증 메시지만 인정)."""
    with client.websocket_connect(f"/api/ws?token={token_of(people['a'])}") as ws:
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_inactive_user_cannot_connect(client, people, db):
    people["a"].is_active = False
    db.flush()
    with client.websocket_connect("/api/ws") as ws:
        ws.send_json({"type": "auth", "token": token_of(people["a"])})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    assert exc.value.code == 4401


def test_new_message_reaches_participants_only(client, people, auth_headers):
    h = auth_headers
    conv = client.post(BASE + "/conversations", headers=h(people["a"]), json={"kind": "direct", "member_ids": [people["b"].id]}).json()

    cm_a, ws_a = connect(client, people["a"])
    cm_b, ws_b = connect(client, people["b"])
    cm_c, ws_c = connect(client, people["c"])  # 대화방과 상관없는 직원
    try:
        sent = client.post(BASE + f"/conversations/{conv['id']}/messages", headers=h(people["a"]), json={"body": "실시간 테스트"}).json()

        for ws in (ws_a, ws_b):  # 보낸 사람(다른 창 포함)과 받는 사람 모두에게
            event = ws.receive_json()
            assert event["type"] == "message.created"
            assert event["message"]["id"] == sent["id"] and event["message"]["body"] == "실시간 테스트"
            assert event["message"]["sender_name"] == "가" and event["message"]["conversation_id"] == conv["id"]
        assert idle(ws_c) == {"type": "pong"}  # 참여자가 아닌 사람에게는 아무것도 오지 않았다
    finally:
        for cm in (cm_a, cm_b, cm_c):
            cm.__exit__(None, None, None)


def test_multiple_connections_of_one_user_all_receive(client, people, auth_headers):
    conv = client.post(BASE + "/conversations", headers=auth_headers(people["a"]), json={"kind": "direct", "member_ids": [people["b"].id]}).json()
    cm1, ws1 = connect(client, people["b"])
    cm2, ws2 = connect(client, people["b"])  # 같은 사람이 앱과 브라우저를 함께 켠 경우
    try:
        client.post(BASE + f"/conversations/{conv['id']}/messages", headers=auth_headers(people["a"]), json={"body": "둘 다"})
        assert ws1.receive_json()["type"] == "message.created"
        assert ws2.receive_json()["type"] == "message.created"
    finally:
        cm1.__exit__(None, None, None)
        cm2.__exit__(None, None, None)


def test_read_and_conversation_events(client, people, auth_headers):
    h = auth_headers
    cm_a, ws_a = connect(client, people["a"])
    cm_b, ws_b = connect(client, people["b"])
    try:
        conv = client.post(BASE + "/conversations", headers=h(people["a"]), json={"kind": "direct", "member_ids": [people["b"].id]}).json()
        for ws in (ws_a, ws_b):
            assert ws.receive_json() == {"type": "conversation.updated", "conversation_id": conv["id"]}

        msg = client.post(BASE + f"/conversations/{conv['id']}/messages", headers=h(people["a"]), json={"body": "읽어 주세요"}).json()
        ws_a.receive_json(), ws_b.receive_json()

        client.put(BASE + f"/conversations/{conv['id']}/read", headers=h(people["b"]), json={"message_id": msg["id"]})
        for ws in (ws_a, ws_b):  # 보낸 사람은 "상대가 읽었다"를 알 수 있다
            assert ws.receive_json() == {"type": "conversation.read", "conversation_id": conv["id"], "user_id": people["b"].id, "message_id": msg["id"]}

        # 이미 읽은 위치를 다시 보내면 새 알림이 없다
        client.put(BASE + f"/conversations/{conv['id']}/read", headers=h(people["b"]), json={"message_id": msg["id"]})
        assert idle(ws_a) == {"type": "pong"}
    finally:
        cm_a.__exit__(None, None, None)
        cm_b.__exit__(None, None, None)


def test_group_changes_notify_old_and_new_members(client, people, make_user, auth_headers):
    h = auth_headers
    d = make_user(name="라")
    conv = client.post(BASE + "/conversations", headers=h(people["a"]), json={"kind": "group", "member_ids": [people["b"].id, people["c"].id], "title": "방"}).json()
    cm_b, ws_b = connect(client, people["b"])
    cm_d, ws_d = connect(client, d)
    try:
        client.post(BASE + f"/conversations/{conv['id']}/members", headers=h(people["a"]), json={"user_ids": [d.id]})
        for ws in (ws_b, ws_d):
            assert ws.receive_json() == {"type": "conversation.updated", "conversation_id": conv["id"]}

        client.delete(BASE + f"/conversations/{conv['id']}/members/me", headers=h(d))
        assert ws_d.receive_json()["type"] == "conversation.updated"  # 나간 사람의 목록도 갱신
        assert ws_b.receive_json()["type"] == "conversation.updated"
        # 나간 뒤의 새 메시지는 오지 않는다
        client.post(BASE + f"/conversations/{conv['id']}/messages", headers=h(people["a"]), json={"body": "나간 뒤"})
        assert ws_b.receive_json()["type"] == "message.created"
        assert idle(ws_d) == {"type": "pong"}
    finally:
        cm_b.__exit__(None, None, None)
        cm_d.__exit__(None, None, None)


def test_ping_revalidates_and_closes_when_login_is_no_longer_valid(client, people, db):
    cm, ws = connect(client, people["a"])
    try:
        assert idle(ws) == {"type": "pong"}
        people["a"].is_active = False  # 그 사이 계정이 비활성화됨
        db.flush()
        ws.send_json({"type": "ping"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4401
    finally:
        cm.__exit__(None, None, None)


def test_card_login_connection_is_closed_when_card_is_deactivated(client, people, db):
    from app.services.nfc import uid_hash

    device = ClientDevice(name="PC", public_key="ab" * 32, status="approved")
    card = NfcCard(user_id=people["a"].id, uid_hmac=uid_hash("0B9F515D"), uid_last4="515D", label="")
    db.add_all([device, card])
    db.flush()
    token = create_access_token(people["a"].email, extra_claims={"amr": "nfc", "did": device.id, "cid": card.id})
    cm, ws = connect(client, people["a"], token=token)
    try:
        assert idle(ws) == {"type": "pong"}
        card.is_active = False
        db.flush()
        ws.send_json({"type": "ping"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4401
    finally:
        cm.__exit__(None, None, None)


def test_oversized_client_message_is_closed(client, people):
    cm, ws = connect(client, people["a"])
    try:
        ws.send_text("x" * 20000)
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    finally:
        cm.__exit__(None, None, None)
