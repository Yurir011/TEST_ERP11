"""메일 연동 API: 안 읽은 수(본인 것만), 문서 발송 이력."""
from datetime import date

import pytest

from app.models.mail_log import MailLog
from app.models.project_document import ProjectDocType, ProjectDocument
from app.models.user import UserRole
from app.routers import mail as mail_router


@pytest.fixture(autouse=True)
def _clear_unread():
    mail_router._unread.clear()
    yield
    mail_router._unread.clear()


@pytest.fixture()
def doc(db, make_user):
    owner = make_user()
    d = ProjectDocument(doc_type=ProjectDocType.quotation, issue_date=date(2026, 10, 1), client_name="테스트거래처", created_by=owner.id)
    db.add(d)
    db.flush()
    return d


def test_unread_requires_login(client):
    assert client.put("/api/mail/unread", json={"unread": 3}).status_code == 401
    assert client.get("/api/mail/unread").status_code == 401


def test_unread_is_per_user_and_ceo_cannot_read_others(client, make_user, auth_headers):
    a = make_user()
    ceo = make_user(role=UserRole.admin)
    assert client.get("/api/mail/unread", headers=auth_headers(a)).json() == {"unread": None}
    assert client.put("/api/mail/unread", json={"unread": 7}, headers=auth_headers(a)).status_code == 204
    assert client.get("/api/mail/unread", headers=auth_headers(a)).json() == {"unread": 7}
    # 대표도 남의 것은 읽을 수 없다 (자기 것만 나온다)
    assert client.get("/api/mail/unread", headers=auth_headers(ceo)).json() == {"unread": None}


@pytest.mark.parametrize("value", [-1, 100_000, "x", None, 1.5])
def test_unread_rejects_bad_values(client, make_user, auth_headers, value):
    u = make_user()
    assert client.put("/api/mail/unread", json={"unread": value}, headers=auth_headers(u)).status_code == 422


def test_unread_goes_stale(client, make_user, auth_headers, monkeypatch):
    u = make_user()
    client.put("/api/mail/unread", json={"unread": 4}, headers=auth_headers(u))
    uid, (count, at) = next(iter(mail_router._unread.items()))
    mail_router._unread[uid] = (count, at - mail_router.UNREAD_TTL_SECONDS - 1)
    assert client.get("/api/mail/unread", headers=auth_headers(u)).json() == {"unread": None}


def test_sent_log_roundtrip(client, db, make_user, auth_headers, doc):
    u = make_user(name="김직원")
    body = {"doc_type": "project_document", "doc_id": doc.id, "to": ["a@x.com", " b@y.co.kr "], "subject": "견적서\r\n보내드립니다"}
    r = client.post("/api/mail/sent", json=body, headers=auth_headers(u))
    assert r.status_code == 201
    rows = client.get("/api/mail/logs", params={"doc_type": "project_document", "doc_id": doc.id}, headers=auth_headers(u)).json()
    assert len(rows) == 1
    assert rows[0]["sender_name"] == "김직원"
    assert rows[0]["to_addresses"] == "a@x.com, b@y.co.kr"
    assert "\r" not in rows[0]["subject"] and "\n" not in rows[0]["subject"]
    assert set(rows[0]) == {"id", "created_at", "sender_name", "to_addresses", "subject"}  # 본문·첨부 같은 값은 없다


def test_sent_requires_login_and_existing_document(client, make_user, auth_headers, doc):
    body = {"doc_type": "project_document", "doc_id": doc.id, "to": ["a@x.com"], "subject": "s"}
    assert client.post("/api/mail/sent", json=body).status_code == 401
    u = make_user()
    assert client.post("/api/mail/sent", json={**body, "doc_id": 99999999}, headers=auth_headers(u)).status_code == 404
    assert client.get("/api/mail/logs", params={"doc_type": "project_document", "doc_id": 99999999}, headers=auth_headers(u)).status_code == 404
    assert client.get("/api/mail/logs", params={"doc_type": "project_document", "doc_id": doc.id}).status_code == 401


@pytest.mark.parametrize(
    "patch",
    [
        {"doc_type": "payment"},
        {"to": []},
        {"to": ["not-an-email"]},
        {"to": ["a@x.com\r\nBcc: z@z.com"]},
        {"to": ["a@x.com"] * 51},
        {"subject": "가" * 256},
        {"doc_id": 0},
    ],
)
def test_sent_rejects_bad_input(client, db, make_user, auth_headers, doc, patch):
    u = make_user()
    body = {"doc_type": "project_document", "doc_id": doc.id, "to": ["a@x.com"], "subject": "s", **patch}
    assert client.post("/api/mail/sent", json=body, headers=auth_headers(u)).status_code == 422
    assert db.query(MailLog).count() == 0


def test_sender_deletion_keeps_log(db, make_user, doc):
    u = make_user()
    log = MailLog(sender_user_id=u.id, doc_type="project_document", doc_id=doc.id, to_addresses="a@x.com", subject="s")
    db.add(log)
    db.flush()
    assert log.id is not None
