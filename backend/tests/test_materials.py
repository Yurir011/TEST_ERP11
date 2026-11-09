"""자재관리: 항목·이름·하위 속성, 입고/추가 입고/출고와 현재 개수, 출고 사유 필수."""
from app.models.user import UserRole


def _new(client, h, **over):
    body = {"category": "ic", "name": "STM32F103C8T6", "sub_levels": ["MCU", "ARM Cortex-M3", "LQFP48"], "initial_in": {"movement_date": "2026-10-05", "quantity": 500}}
    body.update(over)
    res = client.post("/api/materials", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _move(client, h, mid, **body):
    return client.post(f"/api/materials/{mid}/movements", headers=h, json=body)


def test_create_with_sub_levels_skips_empty_and_records_first_in(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    m = _new(client, h, sub_levels=["MCU", "", "  ", "LQFP48"])
    assert m["sub_levels"] == ["MCU", "LQFP48"]  # 비어 있는 단계는 건너뛴다
    assert (m["category"], m["category_label"], m["current_qty"], m["total_in"]) == ("ic", "IC", 500, 500)
    assert m["last_in"] == {"movement_date": "2026-10-05", "quantity": 500} and m["last_out"] is None
    assert [x["kind"] for x in m["movements"]] == ["in"]
    # 하위 속성 없이, 처음 입고 없이도 등록된다
    bare = _new(client, h, category="subsidiary", name="포장 박스", sub_levels=[], initial_in=None)
    assert bare["sub_levels"] == [] and bare["current_qty"] == 0 and bare["movements"] == []


def test_current_qty_is_in_plus_add_minus_out(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    mid = _new(client, h)["id"]
    assert _move(client, h, mid, kind="add", movement_date="2026-10-28", quantity=200, note="2차 구매분").status_code == 201
    assert _move(client, h, mid, kind="out", movement_date="2026-10-12", quantity=150, reason="시제품 제작").status_code == 201
    d = _move(client, h, mid, kind="out", movement_date="2026-11-03", quantity=130, reason="시제품 제작", note="3차").json()
    assert (d["current_qty"], d["total_in"], d["total_add"], d["total_out"]) == (420, 500, 200, 280)
    assert d["last_in"]["movement_date"] == "2026-10-28" and d["last_out"]["movement_date"] == "2026-11-03"
    assert [x["movement_date"] for x in d["movements"]] == ["2026-11-03", "2026-10-28", "2026-10-12", "2026-10-05"]  # 최근순
    assert d["movements"][0]["reason"] == "시제품 제작" and d["movements"][0]["created_by_name"] == "직원"


def test_out_requires_reason_and_cannot_exceed_stock(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    mid = _new(client, h)["id"]
    assert _move(client, h, mid, kind="out", movement_date="2026-11-01", quantity=1).status_code == 422  # 사유 없음
    assert _move(client, h, mid, kind="out", movement_date="2026-11-01", quantity=1, reason="  ").status_code == 422
    too_many = _move(client, h, mid, kind="out", movement_date="2026-11-01", quantity=501, reason="생산 불출")
    assert too_many.status_code == 400 and "500" in too_many.json()["detail"]
    assert _move(client, h, mid, kind="out", movement_date="2026-11-01", quantity=0, reason="x").status_code == 422
    # 입고에 붙인 사유는 저장하지 않는다 (사유는 출고에서만)
    d = _move(client, h, mid, kind="add", movement_date="2026-11-02", quantity=5, reason="무시됨").json()
    assert d["movements"][0]["reason"] is None


def test_filter_by_category_and_search(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    _new(client, h)
    _new(client, h, category="injection", name="상부 케이스", sub_levels=["케이스", "상부", "ABS 검정"], initial_in=None)
    _new(client, h, category="subsidiary", name="M3 볼트", sub_levels=["체결", "볼트"], initial_in=None)
    assert [r["name"] for r in client.get("/api/materials?category=injection", headers=h).json()] == ["상부 케이스"]
    assert len(client.get("/api/materials", headers=h).json()) == 3
    assert [r["name"] for r in client.get("/api/materials?q=LQFP", headers=h).json()] == ["STM32F103C8T6"]  # 하위 속성으로도 찾는다
    assert [r["name"] for r in client.get("/api/materials?q=볼트", headers=h).json()] == ["M3 볼트"]
    assert client.get("/api/materials?category=wrong", headers=h).status_code == 400


def test_validation(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    assert client.post("/api/materials", headers=h, json={"category": "ic", "name": "  "}).status_code == 422
    assert client.post("/api/materials", headers=h, json={"category": "other", "name": "x"}).status_code == 422
    assert client.post("/api/materials", headers=h, json={"category": "ic", "name": "x", "sub_levels": [str(i) for i in range(11)]}).status_code == 422


def test_update_keeps_movements_and_delete_is_admin_only(client, make_user, auth_headers):
    staff, admin = make_user(name="직원"), make_user(role=UserRole.admin, name="대표")
    hs, ha = auth_headers(staff), auth_headers(admin)
    m = _new(client, hs)
    upd = client.put(f"/api/materials/{m['id']}", headers=hs, json={"category": "ic", "name": "STM32F103C8T6-B", "sub_levels": ["MCU"]})
    assert upd.status_code == 200 and upd.json()["name"] == "STM32F103C8T6-B" and upd.json()["current_qty"] == 500
    assert client.delete(f"/api/materials/{m['id']}", headers=hs).status_code == 403
    mv = upd.json()["movements"][0]["id"]
    _move(client, hs, m["id"], kind="out", movement_date="2026-11-01", quantity=400, reason="생산 불출")
    # 입고를 지우면 현재 개수가 음수가 되므로 거절, 직원은 지울 수 없다
    assert client.delete(f"/api/materials/{m['id']}/movements/{mv}", headers=hs).status_code == 403
    assert client.delete(f"/api/materials/{m['id']}/movements/{mv}", headers=ha).status_code == 400
    assert client.delete(f"/api/materials/{m['id']}", headers=ha).status_code == 204
    assert client.get(f"/api/materials/{m['id']}", headers=hs).status_code == 404


def test_site_admin_cannot_use_materials(client, make_user, auth_headers):
    h = auth_headers(make_user(role=UserRole.site_admin, name="사이트관리자"))
    assert client.get("/api/materials", headers=h).status_code == 403
