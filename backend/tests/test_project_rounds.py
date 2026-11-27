"""프로젝트 회차: 기존 프로젝트 불러오기 + 같은 묶음으로 잇기, 해(年)와 상관없이 묶음 전체를 시작일 순으로 번호 매기기."""
from datetime import date

from app.models.project import Project, ProjectStatus


def _create(client, headers, client_id, name, start=None, **extra):
    body = {"name": name, "client_id": client_id, "start_date": start, **extra}
    r = client.post("/api/projects", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_standalone_project_has_no_round(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    p = _create(client, headers, c.id, "단독", f"{date.today().year}-01-10")
    assert p["series_id"] is None and p["round_no"] is None


def test_link_series_numbers_all_rounds_across_years(client, db, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    year = date.today().year
    old = _create(client, headers, c.id, "중계기", f"{year - 1}-03-05")
    r1 = _create(client, headers, c.id, "중계기", f"{year}-02-01", from_project_id=old["id"], link_series=True)
    r2 = _create(client, headers, c.id, "중계기", f"{year}-06-01", from_project_id=r1["id"], link_series=True)
    assert r1["series_id"] == r2["series_id"] == old["id"]
    # 해가 달라도 같은 묶음이면 시작일 순으로 1·2·3회차 (작년 프로젝트도 탭에 들어온다)
    got = {p["id"]: p for p in client.get(f"/api/projects/{old['id']}/rounds", headers=headers).json()}
    assert (got[old["id"]]["round_no"], got[old["id"]]["round_total"]) == (1, 3)
    assert (got[r1["id"]]["round_no"], got[r1["id"]]["round_total"]) == (2, 3)
    assert (got[r2["id"]]["round_no"], got[r2["id"]]["round_total"]) == (3, 3)
    listed = {p["id"]: p for p in client.get("/api/projects", headers=headers).json()}
    assert listed[r2["id"]]["round_no"] == 3


def test_import_without_link_keeps_projects_separate(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    src = _create(client, headers, c.id, "원본", f"{date.today().year}-01-01")
    new = _create(client, headers, c.id, "복사본", f"{date.today().year}-05-01", from_project_id=src["id"])
    assert new["series_id"] is None
    assert client.get(f"/api/projects/{src['id']}", headers=headers).json()["series_id"] is None


def test_import_copies_stages_and_bom_when_asked(client, db, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    src = _create(client, headers, c.id, "원본", f"{date.today().year}-01-01")
    assert client.post(f"/api/projects/{src['id']}/progress-stages", json={"name": "설계"}, headers=headers).status_code in (200, 201)
    new = _create(
        client, headers, c.id, "복사본", f"{date.today().year}-05-01",
        from_project_id=src["id"], copy_stages=True,
    )
    p = db.query(Project).filter(Project.id == new["id"]).first()
    assert [s.name for s in p.progress_stages] == ["설계"]
    assert p.progress_stages[0].progress_percent == 0
    assert p.bom_lines == []


def test_import_unknown_source_is_400(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    r = client.post("/api/projects", json={"name": "x", "client_id": c.id, "from_project_id": 999999}, headers=headers)
    assert r.status_code == 400


def test_tab_add_copies_progress_of_pressed_round(client, db, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    year = date.today().year
    src = _create(client, headers, c.id, "원본", f"{year}-01-01")
    assert client.post(f"/api/projects/{src['id']}/progress-stages", json={"name": "설계"}, headers=headers).status_code in (200, 201)
    stage = db.query(Project).filter(Project.id == src["id"]).first().progress_stages[0]
    stage.progress_percent = 40
    stage.start_date = date(year, 1, 5)
    stage.end_date = date(year, 1, 20)
    db.query(Project).filter(Project.id == src["id"]).first().status = ProjectStatus.in_progress
    db.flush()

    new = _create(
        client, headers, c.id, "원본", f"{year}-01-01",
        from_project_id=src["id"], copy_stages=True, copy_progress=True, link_series=True,
    )
    p = db.query(Project).filter(Project.id == new["id"]).first()
    assert [(s.name, s.progress_percent, s.start_date, s.end_date) for s in p.progress_stages] == [("설계", 40, date(year, 1, 5), date(year, 1, 20))]
    assert p.status == ProjectStatus.in_progress and p.series_id == src["id"]
    # 진행상황을 복사하지 않는 다음 회차는 0% 로 시작한다
    nxt = _create(client, headers, c.id, "원본", f"{year}-06-01", from_project_id=src["id"], copy_stages=True, link_series=True)
    q = db.query(Project).filter(Project.id == nxt["id"]).first()
    assert q.progress_stages[0].progress_percent == 0 and q.status == ProjectStatus.estimate


def test_round_label_can_be_renamed_and_cleared(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    year = date.today().year
    r1 = _create(client, headers, c.id, "중계기", f"{year}-02-01")
    r2 = _create(client, headers, c.id, "중계기", f"{year}-06-01", from_project_id=r1["id"], link_series=True)
    assert r2["round_label"] is None
    res = client.put(f"/api/projects/{r2['id']}/round-label", json={"label": "  양산 1차  "}, headers=headers)
    assert res.status_code == 200 and res.json()["round_label"] == "양산 1차"
    rounds = client.get(f"/api/projects/{r2['id']}/rounds", headers=headers).json()
    assert [r["round_label"] for r in rounds] == [None, "양산 1차"] and [r["round_no"] for r in rounds] == [1, 2]
    res = client.put(f"/api/projects/{r2['id']}/round-label", json={"label": "   "}, headers=headers)
    assert res.json()["round_label"] is None


def test_tab_add_on_last_year_project_still_makes_tabs_and_round_can_be_deleted(client, db, make_user, make_client, auth_headers):
    from app.models.user import UserRole

    admin = make_user(role=UserRole.admin)
    headers = auth_headers(admin)
    c = make_client(name="거래처")
    last = date.today().year - 1
    src = _create(client, headers, c.id, "작년 프로젝트", f"{last}-11-09")
    new = _create(client, headers, c.id, "작년 프로젝트", f"{last}-11-09", from_project_id=src["id"], link_series=True)
    assert new["round_no"] == 2  # 작년 시작이라도 탭(회차 번호)이 생긴다
    rounds = client.get(f"/api/projects/{new['id']}/rounds", headers=headers).json()
    assert [r["round_no"] for r in rounds] == [1, 2]

    # 같은 묶음에 다른 회차가 남으면 폐기하지 않아도 그 회차만 삭제할 수 있다
    assert client.delete(f"/api/projects/{new['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/projects/{new['id']}", headers=headers).status_code == 404
    # 남은 회차는 단독이 되었으므로 폐기 전에는 삭제할 수 없다
    assert client.delete(f"/api/projects/{src['id']}", headers=headers).status_code == 400
