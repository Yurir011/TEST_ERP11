"""프로젝트 날짜별 메모: 추가·조회(최근 날짜 먼저)·삭제 권한."""
from app.models.project import Project
from app.models.user import JobTitle, UserRole


def _project(db, make_client, user) -> Project:
    client = make_client()
    project = Project(name="메모 테스트 프로젝트", client_id=client.id, created_by=user.id)
    db.add(project)
    db.flush()
    return project


def test_add_list_delete_note(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee, name="작성자")
    project = _project(db, make_client, me)
    headers = auth_headers(me)

    r1 = client.post(f"/api/projects/{project.id}/date-notes", json={"note_date": "2026-10-08", "content": "  첫 메모  "}, headers=headers)
    assert r1.status_code == 201
    assert r1.json()["content"] == "첫 메모"
    assert r1.json()["author_name"] == "작성자"
    client.post(f"/api/projects/{project.id}/date-notes", json={"note_date": "2026-10-20", "content": "최근 메모"}, headers=headers)

    listed = client.get(f"/api/projects/{project.id}/date-notes", headers=headers).json()
    assert [n["note_date"] for n in listed] == ["2026-10-20", "2026-10-08"]  # 최근 날짜가 먼저

    assert client.delete(f"/api/projects/{project.id}/date-notes/{r1.json()['id']}", headers=headers).status_code == 204
    assert len(client.get(f"/api/projects/{project.id}/date-notes", headers=headers).json()) == 1


def test_blank_or_too_long_note_is_rejected(client, db, make_user, make_client, auth_headers):
    me = make_user()
    project = _project(db, make_client, me)
    headers = auth_headers(me)
    url = f"/api/projects/{project.id}/date-notes"
    assert client.post(url, json={"note_date": "2026-10-08", "content": "   "}, headers=headers).status_code == 422
    assert client.post(url, json={"note_date": "2026-10-08", "content": "가" * 2001}, headers=headers).status_code == 422


def test_only_author_or_admin_can_delete(client, db, make_user, make_client, auth_headers):
    author = make_user(name="작성자")
    other = make_user(name="다른직원")
    admin = make_user(role=UserRole.admin, title=JobTitle.ceo)
    project = _project(db, make_client, author)
    note = client.post(
        f"/api/projects/{project.id}/date-notes", json={"note_date": "2026-10-08", "content": "삭제 테스트"}, headers=auth_headers(author)
    ).json()
    url = f"/api/projects/{project.id}/date-notes/{note['id']}"

    assert client.delete(url, headers=auth_headers(other)).status_code == 403
    assert client.delete(url, headers=auth_headers(admin)).status_code == 204


def test_unknown_project_is_404(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    assert client.get("/api/projects/999999/date-notes", headers=headers).status_code == 404
    assert client.post("/api/projects/999999/date-notes", json={"note_date": "2026-10-08", "content": "x"}, headers=headers).status_code == 404


def test_reply_follows_parent_date_and_is_deleted_with_it(client, db, make_user, make_client, auth_headers):
    """답글은 원 메모의 날짜에 붙고, 한 단계만 달 수 있으며, 원 메모를 지우면 함께 지워진다."""
    author = make_user(name="작성자")
    other = make_user(name="답글러")
    project = _project(db, make_client, author)
    url = f"/api/projects/{project.id}/date-notes"
    parent = client.post(url, json={"note_date": "2026-10-08", "content": "원 메모"}, headers=auth_headers(author)).json()

    reply = client.post(url, json={"parent_id": parent["id"], "content": "답글입니다"}, headers=auth_headers(other))
    assert reply.status_code == 201, reply.text
    assert (reply.json()["parent_id"], reply.json()["note_date"], reply.json()["author_name"]) == (parent["id"], "2026-10-08", "답글러")

    # 답글에 다시 답글(대댓글)도 달 수 있고, 같은 날짜에 붙는다 / 없는 메모·날짜 없는 새 메모는 거절
    nested = client.post(url, json={"parent_id": reply.json()["id"], "content": "대댓글"}, headers=auth_headers(author))
    assert nested.status_code == 201 and nested.json()["note_date"] == "2026-10-08"
    assert (nested.json()["parent_id"], nested.json()["reply_to_name"]) == (reply.json()["id"], "답글러")
    assert client.post(url, json={"parent_id": 999999, "content": "x"}, headers=auth_headers(other)).status_code == 404
    assert client.post(url, json={"content": "날짜 없음"}, headers=auth_headers(other)).status_code == 422

    listed = client.get(url, headers=auth_headers(author)).json()
    assert [(n["id"], n["parent_id"]) for n in listed] == [(parent["id"], None), (reply.json()["id"], parent["id"]), (nested.json()["id"], reply.json()["id"])]
    assert [n["reply_to_name"] for n in listed] == [None, "작성자", "답글러"]

    # 답글은 쓴 사람이 지울 수 있고, 원 메모를 지우면 답글도 함께 지워진다
    assert client.delete(f"{url}/{reply.json()['id']}", headers=auth_headers(author)).status_code == 403
    again = client.post(url, json={"parent_id": parent["id"], "content": "하나 더"}, headers=auth_headers(other)).json()
    assert client.delete(f"{url}/{again['id']}", headers=auth_headers(other)).status_code == 204
    assert client.delete(f"{url}/{parent['id']}", headers=auth_headers(author)).status_code == 204
    assert client.get(url, headers=auth_headers(author)).json() == []


def test_only_author_can_edit_and_edit_is_marked(client, db, make_user, make_client, auth_headers):
    author = make_user(name="작성자")
    admin = make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표")
    project = _project(db, make_client, author)
    url = f"/api/projects/{project.id}/date-notes"
    note = client.post(url, json={"note_date": "2026-10-08", "content": "처음 내용"}, headers=auth_headers(author)).json()
    assert note["edited_at"] is None

    # 쓴 사람만 고칠 수 있다 (관리자도 다른 사람의 글은 못 고친다)
    assert client.put(f"{url}/{note['id']}", json={"content": "남이 고침"}, headers=auth_headers(admin)).status_code == 403
    assert client.put(f"{url}/{note['id']}", json={"content": "   "}, headers=auth_headers(author)).status_code == 422
    assert client.put(f"{url}/999999", json={"content": "x"}, headers=auth_headers(author)).status_code == 404

    same = client.put(f"{url}/{note['id']}", json={"content": "처음 내용"}, headers=auth_headers(author)).json()
    assert same["edited_at"] is None  # 내용이 그대로면 수정됨으로 표시하지 않는다
    changed = client.put(f"{url}/{note['id']}", json={"content": " 고친 내용 "}, headers=auth_headers(author))
    assert changed.status_code == 200 and changed.json()["content"] == "고친 내용" and changed.json()["edited_at"] is not None
    listed = client.get(url, headers=auth_headers(author)).json()
    assert listed[0]["content"] == "고친 내용" and listed[0]["edited_at"] is not None

    # 답글도 쓴 사람이 고칠 수 있다
    reply = client.post(url, json={"parent_id": note["id"], "content": "답글"}, headers=auth_headers(admin)).json()
    assert client.put(f"{url}/{reply['id']}", json={"content": "답글 수정"}, headers=auth_headers(admin)).json()["reply_to_name"] == "작성자"
