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


def test_release_selected_lines_records_out_movements_and_updates_stock(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    a = _material(client, h, qty=100, name="MCU A")
    b = _material(client, h, qty=50, name="저항 B", sub_levels=["저항"])
    url = f"/api/projects/{p.id}/bom"
    la = client.post(url, headers=h, json={"material_id": a["id"], "quantity": 60}).json()
    lb = client.post(url, headers=h, json={"material_id": b["id"], "quantity": 40}).json()
    assert la["released"] == 0

    res = client.post(f"{url}/release", headers=h, json={"items": [{"line_id": la["id"], "quantity": 60}, {"line_id": lb["id"], "quantity": 10}]})
    assert res.status_code == 200, res.text
    rows = {r["id"]: r for r in res.json()}
    assert rows[la["id"]]["released"] == 60 and rows[la["id"]]["current_qty"] == 40
    assert rows[lb["id"]]["released"] == 10 and rows[lb["id"]]["current_qty"] == 40

    detail = client.get(f"/api/materials/{a['id']}", headers=h).json()
    outs = [x for x in detail["movements"] if x["kind"] == "out"]
    assert len(outs) == 1 and outs[0]["quantity"] == 60 and outs[0]["reason"] == "생산 불출" and "BOM 출고" in outs[0]["note"]

    # 남은 필요 수량(40-10=30)보다 많이는 안 된다
    over = client.post(f"{url}/release", headers=h, json={"items": [{"line_id": lb["id"], "quantity": 31}]})
    assert over.status_code == 400 and "남은 필요 수량" in over.json()["detail"]


def test_release_is_all_or_nothing_and_rejects_shortage_and_unregistered(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    ok = _material(client, h, qty=100, name="충분한 자재")
    low = _material(client, h, qty=5, name="모자란 자재", sub_levels=["x"])
    url = f"/api/projects/{p.id}/bom"
    l_ok = client.post(url, headers=h, json={"material_id": ok["id"], "quantity": 10}).json()
    l_low = client.post(url, headers=h, json={"material_id": low["id"], "quantity": 10}).json()
    l_none = client.post(url, headers=h, json={"item_name": "미등록 자재", "quantity": 3}).json()

    short = client.post(f"{url}/release", headers=h, json={"items": [{"line_id": l_ok["id"], "quantity": 10}, {"line_id": l_low["id"], "quantity": 10}]})
    assert short.status_code == 400 and "재고" in short.json()["detail"]
    assert [r["released"] for r in client.get(url, headers=h).json()] == [0, 0, 0]  # 앞의 줄도 출고되지 않았다
    assert client.get(f"/api/materials/{ok['id']}", headers=h).json()["current_qty"] == 100

    assert client.post(f"{url}/release", headers=h, json={"items": [{"line_id": l_none["id"], "quantity": 1}]}).status_code == 400
    assert client.post(f"{url}/release", headers=h, json={"items": [{"line_id": 999999, "quantity": 1}]}).status_code == 404
    assert client.post(f"{url}/release", headers=h, json={"items": []}).status_code == 422
    dup = client.post(f"{url}/release", headers=h, json={"items": [{"line_id": l_ok["id"], "quantity": 1}, {"line_id": l_ok["id"], "quantity": 1}]})
    assert dup.status_code == 422


def test_release_partial_when_stock_is_short_then_rest_after_restock(client, db, make_user, make_client, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    m = _material(client, h, qty=120, name="부분 출고 자재")
    url = f"/api/projects/{p.id}/bom"
    line = client.post(url, headers=h, json={"material_id": m["id"], "quantity": 300}).json()

    part = client.post(f"{url}/release", headers=h, json={"items": [{"line_id": line["id"], "quantity": 120}]})
    assert part.status_code == 200, part.text
    row = part.json()[0]
    assert row["released"] == 120 and row["current_qty"] == 0 and row["shortage"] == 180  # 남은 180개가 부족

    assert client.post(f"{url}/release", headers=h, json={"items": [{"line_id": line["id"], "quantity": 1}]}).status_code == 400  # 재고 0
    client.post(f"/api/materials/{m['id']}/movements", headers=h, json={"kind": "add", "movement_date": "2026-11-12", "quantity": 500})
    rest = client.post(f"{url}/release", headers=h, json={"items": [{"line_id": line["id"], "quantity": 180}]}).json()[0]
    assert rest["released"] == 300 and rest["shortage"] is None
