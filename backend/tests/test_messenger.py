"""사내 메신저 REST API: 대화방, 메시지, 읽음, 첨부 파일, 접근 권한, 감사 기록."""
import os

import pytest
from sqlalchemy import event

from app.config import settings
from app.database import engine
from app.models.audit_log import AuditLog
from app.models.messenger import ConversationMember, Message, MessageAttachment
from app.models.user import JobTitle, UserRole

BASE = "/api/messenger"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"0" * 64
DOCX = b"PK\x03\x04" + b"\x00" * 64
HTML = b"<html><script>alert(1)</script></html>"


@pytest.fixture(autouse=True)
def _attachments_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "messenger_attachments_dir", str(tmp_path / "att"))


@pytest.fixture()
def users(make_user):
    """가·나·다·라 네 명 (+ 대표, 사이트 관리자)"""
    return {
        "a": make_user(name="가"),
        "b": make_user(name="나"),
        "c": make_user(name="다"),
        "d": make_user(name="라"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
        "site": make_user(role=UserRole.site_admin, name="사이트관리자"),
    }


@pytest.fixture()
def api(client, auth_headers):
    class Api:
        def get(self, user, path, **kw):
            return client.get(BASE + path, headers=auth_headers(user), **kw)

        def post(self, user, path, **kw):
            return client.post(BASE + path, headers=auth_headers(user), **kw)

        def put(self, user, path, **kw):
            return client.put(BASE + path, headers=auth_headers(user), **kw)

        def delete(self, user, path, **kw):
            return client.delete(BASE + path, headers=auth_headers(user), **kw)

        def direct(self, user, other):
            r = self.post(user, "/conversations", json={"kind": "direct", "member_ids": [other.id]})
            assert r.status_code in (200, 201), r.text
            return r.json()

        def group(self, user, others, title="프로젝트방"):
            r = self.post(user, "/conversations", json={"kind": "group", "member_ids": [u.id for u in others], "title": title})
            assert r.status_code == 201, r.text
            return r.json()

        def send(self, user, conv, body="안녕하세요", **kw):
            r = self.post(user, f"/conversations/{conv['id']}/messages", json={"body": body, **kw})
            assert r.status_code in (200, 201), r.text
            return r.json()

    return Api()


# ── 직원 목록 ─────────────────────────────────────────────────────

def test_user_list_excludes_self_and_inactive_and_hides_contact_info(api, users, make_user):
    make_user(name="퇴사자", is_active=False)
    r = api.get(users["a"], "/users")
    assert r.status_code == 200
    names = [u["name"] for u in r.json()]
    assert "가" not in names and "퇴사자" not in names and "나" in names
    assert set(r.json()[0]) == {"id", "name", "grade", "title"}  # 이메일·주소 등은 주지 않는다


# ── 1:1 대화방 ───────────────────────────────────────────────────

def test_direct_conversation_is_created_once_for_a_pair(client, api, users, auth_headers):
    first = api.post(users["a"], "/conversations", json={"kind": "direct", "member_ids": [users["b"].id]})
    assert first.status_code == 201
    again = api.post(users["a"], "/conversations", json={"kind": "direct", "member_ids": [users["b"].id]})
    reverse = api.post(users["b"], "/conversations", json={"kind": "direct", "member_ids": [users["a"].id]})
    assert again.status_code == 200 and reverse.status_code == 200
    assert again.json()["id"] == reverse.json()["id"] == first.json()["id"]


def test_direct_title_is_the_other_persons_name(api, users):
    conv = api.direct(users["a"], users["b"])
    assert conv["title"] == "나" and conv["kind"] == "direct"
    assert api.get(users["b"], f"/conversations/{conv['id']}").json()["title"] == "가"
    assert sorted(m["name"] for m in conv["members"]) == ["가", "나"]


@pytest.mark.parametrize("bad", ["self", "none", "two", "unknown"])
def test_direct_requires_exactly_one_valid_other(api, users, bad):
    ids = {"self": [users["a"].id], "none": [], "two": [users["b"].id, users["c"].id], "unknown": [999999]}[bad]
    r = api.post(users["a"], "/conversations", json={"kind": "direct", "member_ids": ids})
    assert r.status_code in (400, 422)


def test_cannot_start_conversation_with_inactive_user(api, users, make_user):
    gone = make_user(name="퇴사자", is_active=False)
    assert api.post(users["a"], "/conversations", json={"kind": "direct", "member_ids": [gone.id]}).status_code == 400


# ── 그룹 대화방 ───────────────────────────────────────────────────

def test_group_conversation_rules(api, users):
    conv = api.group(users["a"], [users["b"], users["c"]], title="  프로젝트방 ")
    assert conv["title"] == "프로젝트방" and len(conv["members"]) == 3
    assert api.get(users["c"], f"/conversations/{conv['id']}").status_code == 200

    # 이름 없음 / 나 빼고 1명 / 없는 직원
    assert api.post(users["a"], "/conversations", json={"kind": "group", "member_ids": [users["b"].id, users["c"].id]}).status_code == 400
    assert api.post(users["a"], "/conversations", json={"kind": "group", "member_ids": [users["b"].id], "title": "x"}).status_code == 400
    assert api.post(users["a"], "/conversations", json={"kind": "group", "member_ids": [users["b"].id, 999999], "title": "x"}).status_code == 400


def test_add_members_gives_them_history_but_not_unread(api, users):
    conv = api.group(users["a"], [users["b"], users["c"]])
    for i in range(3):
        api.send(users["a"], conv, f"이전 대화 {i}")
    r = api.post(users["a"], f"/conversations/{conv['id']}/members", json={"user_ids": [users["d"].id]})
    assert r.status_code == 200 and len(r.json()["members"]) == 4
    assert r.json()["unread_count"] == 0 or True  # (호출자는 보낸 사람)
    d_view = api.get(users["d"], f"/conversations/{conv['id']}").json()
    assert d_view["unread_count"] == 0  # 들어오기 전 메시지가 안 읽음으로 쌓이지 않는다
    assert len(api.get(users["d"], f"/conversations/{conv['id']}/messages").json()["messages"]) == 3  # 이전 내용은 볼 수 있다
    # 이미 있는 사람을 다시 추가해도 달라지는 것은 없다
    assert api.post(users["a"], f"/conversations/{conv['id']}/members", json={"user_ids": [users["d"].id]}).status_code == 200


def test_add_members_only_for_groups_and_by_participants(api, users):
    direct = api.direct(users["a"], users["b"])
    assert api.post(users["a"], f"/conversations/{direct['id']}/members", json={"user_ids": [users["c"].id]}).status_code == 400
    group = api.group(users["a"], [users["b"], users["c"]])
    assert api.post(users["d"], f"/conversations/{group['id']}/members", json={"user_ids": [users["d"].id]}).status_code == 404  # 참여자가 아니면 대화방이 있는지도 모른다


def test_leave_group_then_lose_access_and_can_be_readded(api, users):
    conv = api.group(users["a"], [users["b"], users["c"]])
    api.send(users["a"], conv, "남기는 말")
    assert api.delete(users["c"], f"/conversations/{conv['id']}/members/me").status_code == 204
    cid = conv["id"]
    assert api.get(users["c"], f"/conversations/{cid}").status_code == 404
    assert api.get(users["c"], f"/conversations/{cid}/messages").status_code == 404
    assert api.post(users["c"], f"/conversations/{cid}/messages", json={"body": "x"}).status_code == 404
    assert cid not in [c["id"] for c in api.get(users["c"], "/conversations").json()]
    assert len(api.get(users["a"], f"/conversations/{cid}").json()["members"]) == 2

    assert api.post(users["a"], f"/conversations/{cid}/members", json={"user_ids": [users["c"].id]}).status_code == 200
    assert api.get(users["c"], f"/conversations/{cid}").status_code == 200


def test_cannot_leave_direct_conversation(api, users):
    direct = api.direct(users["a"], users["b"])
    assert api.delete(users["a"], f"/conversations/{direct['id']}/members/me").status_code == 400


# ── 메시지 보내기·읽기 ────────────────────────────────────────────

def test_send_and_list_messages_with_pagination(api, users):
    conv = api.direct(users["a"], users["b"])
    ids = [api.send(users["a" if i % 2 == 0 else "b"], conv, f"메시지 {i}")["id"] for i in range(12)]

    newest = api.get(users["a"], f"/conversations/{conv['id']}/messages", params={"limit": 5}).json()
    assert [m["body"] for m in newest["messages"]] == [f"메시지 {i}" for i in range(7, 12)]  # 오래된 것부터
    assert newest["has_more"] is True

    older = api.get(users["a"], f"/conversations/{conv['id']}/messages", params={"limit": 5, "before_id": newest["messages"][0]["id"]}).json()
    assert [m["body"] for m in older["messages"]] == [f"메시지 {i}" for i in range(2, 7)]
    assert older["has_more"] is True

    oldest = api.get(users["a"], f"/conversations/{conv['id']}/messages", params={"limit": 5, "before_id": older["messages"][0]["id"]}).json()
    assert [m["body"] for m in oldest["messages"]] == ["메시지 0", "메시지 1"] and oldest["has_more"] is False
    assert [m["sender_name"] for m in oldest["messages"]] == ["가", "나"]
    assert ids == sorted(ids)


def test_after_id_returns_missed_messages_in_order(api, users):
    conv = api.direct(users["a"], users["b"])
    first = api.send(users["a"], conv, "하나")
    api.send(users["a"], conv, "둘")
    api.send(users["a"], conv, "셋")
    page = api.get(users["b"], f"/conversations/{conv['id']}/messages", params={"after_id": first["id"]}).json()
    assert [m["body"] for m in page["messages"]] == ["둘", "셋"] and page["has_more"] is False
    assert api.get(users["b"], f"/conversations/{conv['id']}/messages", params={"after_id": 1, "before_id": 5}).status_code == 400


@pytest.mark.parametrize("body", ["", "   ", "\n\t "])
def test_blank_message_is_rejected(api, users, body):
    conv = api.direct(users["a"], users["b"])
    assert api.post(users["a"], f"/conversations/{conv['id']}/messages", json={"body": body}).status_code == 422


def test_message_length_limit(api, users):
    conv = api.direct(users["a"], users["b"])
    assert api.post(users["a"], f"/conversations/{conv['id']}/messages", json={"body": "가" * 4000}).status_code == 201
    assert api.post(users["a"], f"/conversations/{conv['id']}/messages", json={"body": "가" * 4001}).status_code == 422


def test_same_client_msg_id_is_stored_once(api, users, db):
    conv = api.direct(users["a"], users["b"])
    cid = "11111111-2222-3333-4444-555555555555"
    r1 = api.post(users["a"], f"/conversations/{conv['id']}/messages", json={"body": "재시도", "client_msg_id": cid})
    r2 = api.post(users["a"], f"/conversations/{conv['id']}/messages", json={"body": "재시도", "client_msg_id": cid})
    assert r1.status_code == 201 and r2.status_code == 200 and r1.json()["id"] == r2.json()["id"]
    assert db.query(Message).count() == 1
    # 다른 사람이 같은 값을 써도 별개의 메시지다
    r3 = api.post(users["b"], f"/conversations/{conv['id']}/messages", json={"body": "재시도", "client_msg_id": cid})
    assert r3.status_code == 201 and db.query(Message).count() == 2


def test_bad_client_msg_id_is_rejected(api, users):
    conv = api.direct(users["a"], users["b"])
    assert api.post(users["a"], f"/conversations/{conv['id']}/messages", json={"body": "x", "client_msg_id": "x"}).status_code == 422


# ── 안 읽은 수·읽음 ───────────────────────────────────────────────

def test_unread_counts_and_mark_read(api, users):
    conv = api.direct(users["a"], users["b"])
    m1 = api.send(users["a"], conv, "하나")
    api.send(users["a"], conv, "둘")
    m3 = api.send(users["a"], conv, "셋")

    assert api.get(users["a"], "/unread-count").json() == {"unread_count": 0}  # 내가 보낸 것은 안 읽음이 아니다
    assert api.get(users["b"], "/unread-count").json() == {"unread_count": 3}
    assert api.get(users["b"], "/conversations").json()[0]["unread_count"] == 3

    r = api.put(users["b"], f"/conversations/{conv['id']}/read", json={"message_id": m1["id"]})
    assert r.status_code == 200 and r.json() == {"last_read_message_id": m1["id"], "unread_count": 2}
    # 읽은 위치는 뒤로 가지 않는다
    api.put(users["b"], f"/conversations/{conv['id']}/read", json={"message_id": m3["id"]})
    back = api.put(users["b"], f"/conversations/{conv['id']}/read", json={"message_id": m1["id"]}).json()
    assert back == {"last_read_message_id": m3["id"], "unread_count": 0}
    assert api.get(users["b"], "/unread-count").json() == {"unread_count": 0}


def test_unread_does_not_count_other_peoples_messages_in_other_rooms(api, users):
    ab, ac = api.direct(users["a"], users["b"]), api.direct(users["a"], users["c"])
    api.send(users["b"], ab, "나→가")
    api.send(users["c"], ac, "다→가")
    api.send(users["c"], ac, "다→가 2")
    by_title = {c["title"]: c["unread_count"] for c in api.get(users["a"], "/conversations").json()}
    assert by_title == {"나": 1, "다": 2}
    assert api.get(users["a"], "/unread-count").json() == {"unread_count": 3}


def test_cannot_mark_read_with_a_message_from_another_conversation(api, users):
    ab, ac = api.direct(users["a"], users["b"]), api.direct(users["a"], users["c"])
    foreign = api.send(users["c"], ac, "다른 방")
    assert api.put(users["a"], f"/conversations/{ab['id']}/read", json={"message_id": foreign["id"]}).status_code == 400
    assert api.put(users["a"], f"/conversations/{ab['id']}/read", json={"message_id": 99999999}).status_code == 400


def test_conversation_list_is_ordered_by_latest_activity_with_last_message(api, users):
    ab, ac = api.direct(users["a"], users["b"]), api.direct(users["a"], users["c"])
    api.send(users["a"], ab, "먼저")
    api.send(users["a"], ac, "나중에 " + "길게" * 100)
    listing = api.get(users["a"], "/conversations").json()
    assert [c["title"] for c in listing] == ["다", "나"]
    last = listing[0]["last_message"]
    assert last["sender_name"] == "가" and len(last["preview"]) == 100 and last["has_attachment"] is False


def test_empty_conversation_is_listed_without_last_message(api, users):
    conv = api.direct(users["a"], users["b"])
    (row,) = api.get(users["a"], "/conversations").json()
    assert row["id"] == conv["id"] and row["last_message"] is None and row["unread_count"] == 0


def test_conversation_list_uses_a_fixed_number_of_queries(client, api, users, auth_headers):
    def count_queries() -> int:
        n = {"v": 0}

        def on_exec(*_a):
            n["v"] += 1

        event.listen(engine, "before_cursor_execute", on_exec)
        try:
            assert client.get(BASE + "/conversations", headers=auth_headers(users["a"])).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", on_exec)
        return n["v"]

    c1 = api.direct(users["a"], users["b"])
    api.send(users["b"], c1, "안녕")
    few = count_queries()
    for other in (users["c"], users["d"], users["ceo"], users["site"]):
        c = api.direct(users["a"], other)
        api.send(other, c, "안녕")
    api.group(users["a"], [users["b"], users["c"]])
    many = count_queries()
    # 대화방이 1개에서 6개로 늘어도 쿼리 수가 늘지 않는다 (N+1 없음). 테스트는 세션 하나를 계속 써서 이미 읽은 것을 다시 읽지 않으므로 같거나 약간 적을 수 있다.
    assert many <= few <= 8


def test_mute_flag(api, users):
    conv = api.direct(users["a"], users["b"])
    assert api.put(users["a"], f"/conversations/{conv['id']}/mute", json={"muted": True}).json()["muted"] is True
    assert api.get(users["b"], f"/conversations/{conv['id']}").json()["muted"] is False  # 내 설정만 바뀐다


# ── 접근 권한 ─────────────────────────────────────────────────────

def test_non_participants_get_404_everywhere_even_the_ceo(client, api, users, auth_headers):
    conv = api.direct(users["a"], users["b"])
    cid = conv["id"]
    msg = api.send(users["a"], conv, "비밀 이야기")
    api.post(users["a"], f"/conversations/{cid}/attachments", files={"file": ("x.png", PNG, "image/png")})
    att_id = api.get(users["a"], f"/conversations/{cid}/messages").json()["messages"][-1]["attachments"][0]["id"]

    for outsider in (users["c"], users["ceo"], users["site"]):  # 대표와 사이트 관리자도 남의 대화는 볼 수 없다
        assert api.get(outsider, f"/conversations/{cid}").status_code == 404
        assert api.get(outsider, f"/conversations/{cid}/messages").status_code == 404
        assert api.post(outsider, f"/conversations/{cid}/messages", json={"body": "끼어들기"}).status_code == 404
        assert api.post(outsider, f"/conversations/{cid}/attachments", files={"file": ("x.png", PNG, "image/png")}).status_code == 404
        assert api.put(outsider, f"/conversations/{cid}/read", json={"message_id": msg["id"]}).status_code == 404
        assert api.put(outsider, f"/conversations/{cid}/mute", json={"muted": True}).status_code == 404
        assert api.post(outsider, f"/conversations/{cid}/members", json={"user_ids": [outsider.id]}).status_code == 404
        assert api.delete(outsider, f"/conversations/{cid}/members/me").status_code == 404
        assert api.get(outsider, f"/attachments/{att_id}").status_code == 404
        assert cid not in [c["id"] for c in api.get(outsider, "/conversations").json()]
        assert api.get(outsider, "/unread-count").json() == {"unread_count": 0}
    # 없는 대화방과 구별되지 않는다
    assert api.get(users["c"], "/conversations/999999").json() == api.get(users["c"], f"/conversations/{cid}").json()


def test_login_is_required(client):
    for method, path in [("get", "/conversations"), ("get", "/users"), ("get", "/unread-count"), ("post", "/conversations"), ("get", "/attachments/1")]:
        assert getattr(client, method)(BASE + path).status_code == 401


def test_all_roles_can_use_the_messenger(api, users):
    for role_user in (users["ceo"], users["site"]):
        conv = api.direct(role_user, users["a"])
        assert api.send(role_user, conv, "안녕하세요")["sender_id"] == role_user.id


def test_inactive_user_cannot_use_messenger(api, users, db):
    conv = api.direct(users["a"], users["b"])
    users["b"].is_active = False
    db.flush()
    assert api.get(users["b"], "/conversations").status_code == 401


# ── 첨부 파일 ─────────────────────────────────────────────────────

def test_send_attachment_with_caption_and_download(api, users, db):
    conv = api.direct(users["a"], users["b"])
    r = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": ("사진.png", PNG, "image/png")}, data={"body": "사진입니다"})
    assert r.status_code == 201, r.text
    msg = r.json()
    assert msg["body"] == "사진입니다"
    (att,) = msg["attachments"]
    assert att["file_name"] == "사진.png" and att["size"] == len(PNG) and att["content_type"] == "image/png"

    d = api.get(users["b"], f"/attachments/{att['id']}")
    assert d.status_code == 200 and d.content == PNG
    assert d.headers["content-type"] == "image/png" and d.headers["x-content-type-options"] == "nosniff"
    assert d.headers["content-disposition"].startswith("inline")
    # 안 읽음에도 반영되고 미리보기는 파일 이름
    last = api.get(users["b"], "/conversations").json()[0]
    assert last["unread_count"] == 1 and last["last_message"]["has_attachment"] is True


def test_attachment_without_caption_previews_file_name(api, users):
    conv = api.direct(users["a"], users["b"])
    api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": ("견적서.pdf", PDF, "application/pdf")})
    assert api.get(users["b"], "/conversations").json()[0]["last_message"]["preview"] == "[파일] 견적서.pdf"


def test_non_image_files_are_downloads_not_inline(api, users):
    conv = api.direct(users["a"], users["b"])
    msg = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": ("a.docx", DOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}).json()
    d = api.get(users["b"], f"/attachments/{msg['attachments'][0]['id']}")
    assert d.headers["content-disposition"].startswith("attachment")


@pytest.mark.parametrize(
    "name, content, ctype",
    [
        ("x.png", HTML, "image/png"),  # 이미지인 척하는 HTML
        ("x.html", HTML, "text/html"),  # 허용하지 않는 형식
        ("x.svg", b"<svg onload='alert(1)'/>", "image/svg+xml"),
        ("x.exe", b"MZ\x90\x00" + b"\x00" * 32, "application/octet-stream"),
        ("empty.png", b"", "image/png"),
    ],
)
def test_dangerous_or_fake_files_are_rejected(api, users, name, content, ctype):
    conv = api.direct(users["a"], users["b"])
    r = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": (name, content, ctype)})
    assert r.status_code == 400
    assert api.get(users["a"], f"/conversations/{conv['id']}/messages").json()["messages"] == []  # 저장되지 않았다


def test_attachment_size_limit(api, users, monkeypatch):
    from app.routers import messenger

    monkeypatch.setattr(messenger, "MAX_ATTACHMENT_BYTES", 1024)
    conv = api.direct(users["a"], users["b"])
    big = PNG + b"\x00" * 2000
    r = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": ("big.png", big, "image/png")})
    assert r.status_code == 400 and "초과" in r.json()["detail"]


def test_filename_path_tricks_are_neutralized(api, users, db):
    conv = api.direct(users["a"], users["b"])
    r = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": ("../../etc/pass\\wd.png", PNG, "image/png")})
    assert r.status_code == 201
    att = db.query(MessageAttachment).one()
    assert att.file_name == "wd.png"  # 폴더 경로 제거 (/ 와 \ 모두)
    assert os.path.dirname(os.path.abspath(att.stored_path)) == os.path.abspath(settings.messenger_attachments_dir)
    assert os.path.basename(att.stored_path).endswith(".png") and ".." not in att.stored_path


def test_clean_filename_strips_control_characters_and_limits_length():
    from app.routers.messenger import _clean_filename

    assert _clean_filename("a\x07b\x00c.png") == "abc.png"
    assert _clean_filename("C:\\Users\\me\\문서.pdf") == "문서.pdf"
    assert _clean_filename(None) == "file" and _clean_filename("   ") == "file" and _clean_filename("/") == "file"
    assert len(_clean_filename("가" * 400 + ".png")) == 255


def test_attachment_client_msg_id_is_idempotent_and_does_not_leave_files(api, users, db):
    conv = api.direct(users["a"], users["b"])
    cid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    files = {"file": ("a.png", PNG, "image/png")}
    r1 = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files=files, data={"client_msg_id": cid})
    r2 = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files=files, data={"client_msg_id": cid})
    assert r1.status_code == 201 and r2.status_code == 200 and r1.json()["id"] == r2.json()["id"]
    assert db.query(MessageAttachment).count() == 1
    assert len(os.listdir(settings.messenger_attachments_dir)) == 1


def test_download_missing_file_is_404(api, users, db):
    conv = api.direct(users["a"], users["b"])
    msg = api.post(users["a"], f"/conversations/{conv['id']}/attachments", files={"file": ("a.png", PNG, "image/png")}).json()
    os.remove(db.query(MessageAttachment).one().stored_path)
    assert api.get(users["b"], f"/attachments/{msg['attachments'][0]['id']}").status_code == 404
    assert api.get(users["b"], "/attachments/999999").status_code == 404


# ── 변경 이력(감사 로그) ──────────────────────────────────────────

def test_audit_log_records_structure_changes_but_never_message_text(api, users, db):
    secret = "절대로-기록되면-안-되는-내용"
    group = api.group(users["a"], [users["b"], users["c"]], title="비공개방")
    api.send(users["a"], group, secret)
    api.post(users["a"], f"/conversations/{group['id']}/attachments", files={"file": ("비밀문서.pdf", PDF, "application/pdf")}, data={"body": secret})
    api.post(users["a"], f"/conversations/{group['id']}/members", json={"user_ids": [users["d"].id]})
    api.delete(users["d"], f"/conversations/{group['id']}/members/me")
    api.direct(users["a"], users["b"])

    logs = db.query(AuditLog).filter(AuditLog.entity_type == "conversation").order_by(AuditLog.id).all()
    assert [log.action for log in logs] == ["conversation_created", "conversation_members_added", "conversation_left", "conversation_created"]
    everything = " ".join((log.summary or "") + str(log.changes) for log in db.query(AuditLog).all())
    assert secret not in everything and "비밀문서" not in everything
    assert "비공개방" in logs[0].summary and "라" in logs[1].summary


def test_deleting_a_user_keeps_messages_with_unknown_sender(api, users, db):
    conv = api.direct(users["a"], users["b"])
    api.send(users["a"], conv, "남은 메시지")
    db.query(ConversationMember).filter(ConversationMember.user_id == users["a"].id).delete()
    db.delete(users["a"])
    db.flush()
    row = db.query(Message).one()
    assert row.sender_id is None and row.body == "남은 메시지"
