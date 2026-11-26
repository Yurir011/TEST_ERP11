"""프로젝트 진행상황 항목: 순서 바꾸기."""
from app.models.project import Project
from app.models.user import UserRole


def _setup(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    project = Project(name="순서 테스트", client_id=make_client().id, created_by=me.id)
    db.add(project)
    db.flush()
    headers = auth_headers(me)
    ids = [
        client.post(f"/api/projects/{project.id}/progress-stages", json={"name": name}, headers=headers).json()["id"]
        for name in ("설계", "제작", "검수")
    ]
    return project, headers, ids


def test_reorder_changes_list_order(client, db, make_user, make_client, auth_headers):
    project, headers, (a, b, c) = _setup(client, db, make_user, make_client, auth_headers)
    r = client.put(f"/api/projects/{project.id}/progress-stages/reorder", json={"ids": [c, a, b]}, headers=headers)
    assert r.status_code == 200
    assert [s["name"] for s in r.json()] == ["검수", "설계", "제작"]
    listed = client.get(f"/api/projects/{project.id}/progress-stages", headers=headers).json()
    assert [s["name"] for s in listed] == ["검수", "설계", "제작"]
    # 새로 추가한 항목은 맨 아래에 붙는다
    new = client.post(f"/api/projects/{project.id}/progress-stages", json={"name": "납품"}, headers=headers).json()
    assert new["order_index"] > max(s["order_index"] for s in listed)


def test_reorder_rejects_stale_or_wrong_id_list(client, db, make_user, make_client, auth_headers):
    project, headers, (a, b, c) = _setup(client, db, make_user, make_client, auth_headers)
    url = f"/api/projects/{project.id}/progress-stages/reorder"
    assert client.put(url, json={"ids": [a, b]}, headers=headers).status_code == 400  # 하나 빠짐
    assert client.put(url, json={"ids": [a, b, c, 99999]}, headers=headers).status_code == 400  # 모르는 번호
    assert client.put(url, json={"ids": [a, a, b]}, headers=headers).status_code == 400  # 중복
    listed = client.get(f"/api/projects/{project.id}/progress-stages", headers=headers).json()
    assert [s["name"] for s in listed] == ["설계", "제작", "검수"]  # 실패하면 그대로


def test_rename_progress_stage_keeps_progress_and_schedule(client, db, make_user, make_client, auth_headers):
    from datetime import date

    from app.models.project import Project
    from app.models.project_progress import ProjectProgressStage

    me = make_user()
    h = auth_headers(me)
    c = make_client(name="거래처")
    p = Project(name="p", client_id=c.id, created_by=me.id)
    db.add(p)
    db.flush()
    st = ProjectProgressStage(project_id=p.id, name="생산", order_index=1, progress_percent=90, start_date=date(2026, 11, 17), end_date=date(2026, 11, 30))
    db.add(st)
    db.flush()

    res = client.put(f"/api/projects/{p.id}/progress-stages/{st.id}/name", json={"name": "  양산  "}, headers=h)
    assert res.status_code == 200, res.text
    assert (res.json()["name"], res.json()["progress_percent"], res.json()["start_date"]) == ("양산", 90, "2026-11-17")
    assert client.put(f"/api/projects/{p.id}/progress-stages/{st.id}/name", json={"name": "   "}, headers=h).status_code == 400
    assert client.put(f"/api/projects/{p.id}/progress-stages/999999/name", json={"name": "x"}, headers=h).status_code == 404
