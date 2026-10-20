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
