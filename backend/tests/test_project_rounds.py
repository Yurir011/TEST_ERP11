"""프로젝트 회차: 기존 프로젝트 불러오기 + 같은 묶음으로 잇기, 올해 회차만 번호 매기기."""
from datetime import date

from app.models.project import Project


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


def test_link_series_numbers_this_year_rounds_only(client, db, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처")
    year = date.today().year
    old = _create(client, headers, c.id, "중계기", f"{year - 1}-03-05")
    r1 = _create(client, headers, c.id, "중계기", f"{year}-02-01", from_project_id=old["id"], link_series=True)
    r2 = _create(client, headers, c.id, "중계기", f"{year}-06-01", from_project_id=r1["id"], link_series=True)
    assert r1["series_id"] == r2["series_id"] == old["id"]
    # 작년 프로젝트는 번호 없이 묶음에만 남고, 올해 둘이 1·2회차
    got = {p["id"]: p for p in client.get(f"/api/projects/{old['id']}/rounds", headers=headers).json()}
    assert got[old["id"]]["round_no"] is None
    assert (got[r1["id"]]["round_no"], got[r1["id"]]["round_total"]) == (1, 2)
    assert (got[r2["id"]]["round_no"], got[r2["id"]]["round_total"]) == (2, 2)
    listed = {p["id"]: p for p in client.get("/api/projects", headers=headers).json()}
    assert listed[r2["id"]]["round_no"] == 2


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
