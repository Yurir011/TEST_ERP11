"""프로젝트 BOM: 자재 연결·미등록 줄·재고 부족 계산·수정·삭제."""
from app.models.project import Project
from app.models.user import UserRole


def _project(db, make_client, user) -> Project:
    client = make_client()
    project = Project(name="BOM 테스트 프로젝트", client_id=client.id, created_by=user.id)
    db.add(project)
    db.flush()
    return project


def _material(client, h, qty=100, **over):
    body = {"category": "ic", "kind": "general", "name": "10uF", "sub_levels": ["MLCC", "0603"], "initial_in": {"movement_date": "2026-11-01", "quantity": qty}}
    body.update(over)
    res = client.post("/api/materials", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_add_registered_line_shows_stock_and_shortage(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    m = _material(client, h, qty=100)
    url = f"/api/projects/{p.id}/bom"

    enough = client.post(url, headers=h, json={"material_id": m["id"], "quantity": 80, "note": " U3 주변 "})
    assert enough.status_code == 201, enough.text
    d = enough.json()
    assert d["registered"] is True and d["code"] == m["code"] and d["item_name"] == "10uF" and d["note"] == "U3 주변"
    assert d["current_qty"] == 100 and d["shortage"] is None

    assert client.put(f"{url}/{d['id']}", headers=h, json={"quantity": 130}).json()["shortage"] == 30
    assert client.post(url, headers=h, json={"material_id": m["id"], "quantity": 1}).status_code == 409  # 같은 자재 두 번 불가


def test_unregistered_line_then_link_after_registering(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    url = f"/api/projects/{p.id}/bom"

    assert client.post(url, headers=h, json={"quantity": 10}).status_code == 422  # 이름도 자재도 없음
    line = client.post(url, headers=h, json={"item_name": "방열 패드 1mm", "quantity": 500}).json()
    assert line["registered"] is False and line["current_qty"] is None and line["shortage"] is None and line["code"] is None

    m = _material(client, h, qty=40, name="방열 패드 1mm", category="subsidiary", kind=None, sub_levels=[])
    linked = client.put(f"{url}/{line['id']}", headers=h, json={"material_id": m["id"]}).json()
    assert linked["registered"] is True and linked["code"] == m["code"] and linked["current_qty"] == 40 and linked["shortage"] == 460


def test_edit_delete_and_unknown_material(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    url = f"/api/projects/{p.id}/bom"
    assert client.post(url, headers=h, json={"material_id": 99999, "quantity": 1}).status_code == 400
    line = client.post(url, headers=h, json={"item_name": "임시 자재", "quantity": 5}).json()
    assert client.post(url, headers=h, json={"item_name": "x", "quantity": 0}).status_code == 422
    upd = client.put(f"{url}/{line['id']}", headers=h, json={"quantity": 7, "note": "메모"}).json()
    assert upd["quantity"] == 7 and upd["note"] == "메모"
    assert client.put(f"{url}/{line['id']}", headers=h, json={"note": None}).json()["note"] is None
    assert client.delete(f"{url}/{line['id']}", headers=h).status_code == 204
    assert client.get(url, headers=h).json() == []
    assert client.get("/api/projects/99999/bom", headers=h).status_code == 404


def test_bom_survives_material_delete_as_unregistered(client, db, make_user, make_client, auth_headers):
    admin = make_user(role=UserRole.admin, name="대표")
    h = auth_headers(admin)
    p = _project(db, make_client, admin)
    m = _material(client, h, qty=10)
    client.post(f"/api/projects/{p.id}/bom", headers=h, json={"material_id": m["id"], "quantity": 5})
    assert client.delete(f"/api/materials/{m['id']}", headers=h).status_code == 204
    rows = client.get(f"/api/projects/{p.id}/bom", headers=h).json()
    assert len(rows) == 1 and rows[0]["registered"] is False and rows[0]["item_name"] == "10uF"
