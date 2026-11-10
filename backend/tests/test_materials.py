"""자재관리: 항목·이름·속성, 입고/추가 입고/출고와 현재 개수, 출고 사유 필수."""
from app.models.user import UserRole


def _new(client, h, **over):
    body = {"category": "ic", "kind": "dedicated", "name": "STM32F103C8T6", "sub_levels": ["MCU", "ARM Cortex-M3", "LQFP48"], "initial_in": {"movement_date": "2026-10-05", "quantity": 500}}
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
    assert (m["category"], m["category_label"], m["current_qty"], m["total_in"]) == ("ic", "회로부품", 500, 500)
    assert m["last_in"] == {"movement_date": "2026-10-05", "quantity": 500, "reels": None, "reel_groups": None} and m["last_out"] is None
    assert [x["kind"] for x in m["movements"]] == ["in"]
    # 속성 없이, 처음 입고 없이도 등록된다
    bare = _new(client, h, category="subsidiary", name="완충재", sub_levels=[], initial_in=None)
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
    assert [r["name"] for r in client.get("/api/materials?q=LQFP", headers=h).json()] == ["STM32F103C8T6"]  # 속성으로도 찾는다
    assert [r["name"] for r in client.get("/api/materials?q=볼트", headers=h).json()] == ["M3 볼트"]
    assert client.get("/api/materials?category=wrong", headers=h).status_code == 400


def test_validation(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    assert client.post("/api/materials", headers=h, json={"category": "ic", "kind": "dedicated", "name": "  "}).status_code == 422
    assert client.post("/api/materials", headers=h, json={"category": "other", "name": "x"}).status_code == 422
    assert client.post("/api/materials", headers=h, json={"category": "ic", "kind": "dedicated", "name": "x", "sub_levels": [str(i) for i in range(11)]}).status_code == 422


def test_update_keeps_movements_and_delete_is_admin_only(client, make_user, auth_headers):
    staff, admin = make_user(name="직원"), make_user(role=UserRole.admin, name="대표")
    hs, ha = auth_headers(staff), auth_headers(admin)
    m = _new(client, hs)
    upd = client.put(f"/api/materials/{m['id']}", headers=hs, json={"category": "ic", "name": "STM32F103C8T6-B", "kind": "dedicated", "sub_levels": ["MCU"]})
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


def test_codes_are_assigned_per_prefix_and_kind_is_required_for_ic(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    a = _new(client, h)
    b = _new(client, h, name="다른 칩")
    g = _new(client, h, kind="general", name="저항 10k")
    assert (a["code"], b["code"], g["code"]) == ("EC-0001", "EC-0002", "EG-0001")  # 접두어(전용/범용)마다 따로 센다
    assert (a["kind"], a["kind_label"], g["kind_label"]) == ("dedicated", "전용", "범용")
    codes = {
        "injection": "ME-0001", "subsidiary": "SU-0001", "packaging": "PK-0001", "consumable": "CS-0001",
    }
    for cat, code in codes.items():
        m = _new(client, h, category=cat, kind="general", name=cat, initial_in=None)  # 회로부품이 아니면 종류는 무시된다
        assert (m["code"], m["kind"], m["kind_label"]) == (code, None, None)
    assert [x["code"] for x in client.get("/api/materials?category=packaging", headers=h).json()] == ["PK-0001"]
    assert client.get("/api/materials?category=packaging", headers=h).json()[0]["category_label"] == "포장재"
    assert [x["code"] for x in client.get("/api/materials?kind=general", headers=h).json()] == ["EG-0001"]
    assert [x["code"] for x in client.get("/api/materials?q=EC-0002", headers=h).json()] == ["EC-0002"]  # 코드로도 찾는다
    # 회로부품은 전용/범용을 골라야 한다
    assert client.post("/api/materials", headers=h, json={"category": "ic", "name": "x"}).status_code == 422


def test_changing_kind_gives_a_new_code(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    m = _new(client, h)
    upd = client.put(f"/api/materials/{m['id']}", headers=h, json={"category": "ic", "kind": "general", "name": "STM32", "sub_levels": []}).json()
    assert upd["code"] == "EG-0001" and upd["kind_label"] == "범용"
    same = client.put(f"/api/materials/{m['id']}", headers=h, json={"category": "ic", "kind": "general", "name": "STM32-B", "sub_levels": []}).json()
    assert same["code"] == "EG-0001"  # 접두어가 그대로면 코드는 유지된다


def test_reel_quantity_is_total_and_shown_together(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    m = _new(client, h, initial_in={"movement_date": "2026-10-05", "reel_groups": [{"per_reel": 2500, "reels": 3}]})
    assert (m["current_qty"], m["current_reels"]) == (7500, 3)
    assert m["movements"][0]["reels"] == 3 and m["movements"][0]["reel_groups"] == [{"per_reel": 2500, "reels": 3}] and m["movements"][0]["quantity"] == 7500
    assert (m["last_in"]["reels"], m["last_in"]["reel_groups"]) == (3, [{"per_reel": 2500, "reels": 3}])
    d = _move(client, h, m["id"], kind="add", movement_date="2026-10-12", quantity=200, note="낱개").json()  # 개로 적은 건 릴 수에 들어가지 않는다
    assert (d["current_qty"], d["current_reels"]) == (7700, 3)
    d = _move(client, h, m["id"], kind="out", movement_date="2026-11-03", reel_groups=[{"per_reel": 2500, "reels": 1}], reason="생산 불출").json()
    assert (d["current_qty"], d["current_reels"], d["total_out"]) == (5200, 2, 2500)
    assert d["movements"][0]["reels"] == 1 and d["movements"][0]["quantity"] == 2500
    # 릴 묶음의 개수·릴 수는 둘 다 있어야 한다, 개수도 릴도 없으면 거절
    assert _move(client, h, m["id"], kind="add", movement_date="2026-11-04", reel_groups=[{"reels": 2}]).status_code == 422
    assert _move(client, h, m["id"], kind="add", movement_date="2026-11-04", reel_groups=[{"per_reel": 2}]).status_code == 422
    assert _move(client, h, m["id"], kind="add", movement_date="2026-11-04").status_code == 422
    # 출고는 개 기준으로 현재 개수를 넘을 수 없다
    too_many = _move(client, h, m["id"], kind="out", movement_date="2026-11-05", reel_groups=[{"per_reel": 2000, "reels": 3}], reason="생산 불출")
    assert too_many.status_code == 400
    plain = _new(client, h, name="개로만", initial_in={"movement_date": "2026-10-05", "quantity": 10})
    assert plain["current_reels"] is None


def test_level_history_lists_previous_values_per_step_by_frequency(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    assert client.get("/api/materials/level-history", headers=h).json() == {"levels": []}
    _new(client, h, sub_levels=["MCU", "Cortex-M3", "LQFP48"], initial_in=None)
    _new(client, h, name="b", sub_levels=["MCU", "Cortex-M4"], initial_in=None)
    _new(client, h, name="c", sub_levels=["저항"], initial_in=None)
    lv = client.get("/api/materials/level-history", headers=h).json()["levels"]
    assert lv == [["MCU", "저항"], ["Cortex-M3", "Cortex-M4"], ["LQFP48"]]  # 칸(단계)마다, 많이 쓴 순서


def test_return_adds_back_stock_and_loss_is_calculated(client, make_user, auth_headers):
    """출고했다가 남은 것을 재입고하면 반납한 개수만 재고에 더해지고, 사용 개수를 적으면 로스(출고 − 반납 − 사용)가 자동 계산된다."""
    h = auth_headers(make_user(name="직원"))
    m = _new(client, h, initial_in={"movement_date": "2026-10-05", "quantity": 5000})
    out = _move(client, h, m["id"], kind="out", movement_date="2026-11-03", quantity=1000, reason="시제품 제작").json()
    out_id = next(x["id"] for x in out["movements"] if x["kind"] == "out")
    assert out["current_qty"] == 4000 and out["movements"][0]["returned_qty"] is None and out["movements"][0]["loss_qty"] is None  # 재입고 전에는 정산 없음
    d = _move(client, h, m["id"], kind="return", movement_date="2026-11-06", quantity=70, return_of=out_id, used_qty=920).json()
    assert (d["current_qty"], d["total_return"], d["total_loss"]) == (4070, 70, 10)  # 재고는 반납 70개만 더해진다
    settled = next(x for x in d["movements"] if x["id"] == out_id)
    assert (settled["returned_qty"], settled["used_total"], settled["loss_qty"]) == (70, 920, 10)
    ret = next(x for x in d["movements"] if x["kind"] == "return")
    assert (ret["return_of"], ret["used_qty"]) == (out_id, 920)


def test_return_without_used_qty_has_no_loss_and_returns_can_be_split(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    m = _new(client, h, initial_in={"movement_date": "2026-10-05", "quantity": 1000})
    d = _move(client, h, m["id"], kind="out", movement_date="2026-11-08", quantity=400, reason="생산 불출").json()
    out_id = d["movements"][0]["id"]
    d = _move(client, h, m["id"], kind="return", movement_date="2026-11-09", quantity=120, return_of=out_id).json()
    s = d["movements"][1]
    assert (s["returned_qty"], s["used_total"], s["loss_qty"]) == (120, None, None) and d["total_loss"] == 0  # 사용 개수를 모르면 로스는 계산하지 않는다
    d = _move(client, h, m["id"], kind="return", movement_date="2026-11-10", quantity=30, return_of=out_id, used_qty=240).json()  # 나눠서 반납
    s = next(x for x in d["movements"] if x["id"] == out_id)
    assert (s["returned_qty"], s["used_total"], s["loss_qty"]) == (150, 240, 10)
    assert d["current_qty"] == 600 + 150


def test_return_validation(client, make_user, auth_headers):
    h = auth_headers(make_user(name="직원"))
    m = _new(client, h, initial_in={"movement_date": "2026-10-05", "quantity": 1000})
    other = _new(client, h, name="다른 자재", initial_in={"movement_date": "2026-10-05", "quantity": 100})
    out_id = _move(client, h, m["id"], kind="out", movement_date="2026-11-03", quantity=100, reason="시제품 제작").json()["movements"][0]["id"]
    assert _move(client, h, m["id"], kind="return", movement_date="2026-11-04", quantity=10).status_code == 422  # 어느 출고 건인지 필요
    assert _move(client, h, m["id"], kind="return", movement_date="2026-11-04", quantity=10, return_of=99999).status_code == 400  # 없는 출고
    in_id = m["movements"][0]["id"]
    assert _move(client, h, m["id"], kind="return", movement_date="2026-11-04", quantity=10, return_of=in_id).status_code == 400  # 출고가 아닌 기록
    assert _move(client, h, other["id"], kind="return", movement_date="2026-11-04", quantity=10, return_of=out_id).status_code == 400  # 다른 자재의 출고
    over = _move(client, h, m["id"], kind="return", movement_date="2026-11-04", quantity=60, return_of=out_id, used_qty=50)
    assert over.status_code == 400 and "110" in over.json()["detail"]  # 반납 + 사용이 출고(100)보다 많다
    assert _move(client, h, m["id"], kind="return", movement_date="2026-11-04", quantity=60, return_of=out_id, used_qty=40).status_code == 201  # 로스 0
    # 출고에 재입고가 연결돼 있으면 출고 기록은 지울 수 없다 (대표)
    admin = auth_headers(make_user(role=UserRole.admin, name="대표"))
    assert client.delete(f"/api/materials/{m['id']}/movements/{out_id}", headers=admin).status_code == 400
    # 재입고는 개/릴로 입력할 수 있다 (재입고로 늘어난 개수가 있으니 입고를 지우면 음수가 되는지도 함께 따진다)
    reel = _move(client, h, m["id"], kind="add", movement_date="2026-11-05", reel_groups=[{"per_reel": 10, "reels": 2}]).json()
    assert reel["current_reels"] == 2


def test_reels_with_different_counts_are_recorded_as_groups(client, make_user, auth_headers):
    """릴마다 개수가 다르면 "개수 × 릴 수" 묶음을 여러 개 준다. 총 개수와 릴 수는 묶음에서 정해지고, 출고에도 같은 방식을 쓴다."""
    h = auth_headers(make_user(name="직원"))
    groups = [{"per_reel": 2500, "reels": 2}, {"per_reel": 2480, "reels": 1}]
    m = _new(client, h, initial_in={"movement_date": "2026-11-10", "reel_groups": groups})
    mv = m["movements"][0]
    assert (mv["quantity"], mv["reels"], mv["reel_groups"]) == (7480, 3, groups)
    assert (m["current_qty"], m["current_reels"]) == (7480, 3)
    # 출고도 릴별로: 2,500개 1릴 + 2,480개 1릴 = 4,980개, 2릴
    d = _move(client, h, m["id"], kind="out", movement_date="2026-11-11", reel_groups=[{"per_reel": 2500, "reels": 1}, {"per_reel": 2480, "reels": 1}], reason="생산 불출").json()
    assert (d["current_qty"], d["current_reels"], d["total_out"]) == (2500, 1, 4980)
    assert d["movements"][0]["reel_groups"] == [{"per_reel": 2500, "reels": 1}, {"per_reel": 2480, "reels": 1}]
    # 묶음이 있으면 quantity 를 같이 보내도 묶음 합계가 우선한다, 개로 적으면 묶음은 비어 있다
    d = _move(client, h, m["id"], kind="add", movement_date="2026-11-12", quantity=999, reel_groups=[{"per_reel": 10, "reels": 3}]).json()
    assert (d["movements"][0]["quantity"], d["movements"][0]["reels"]) == (30, 3)
    d = _move(client, h, m["id"], kind="add", movement_date="2026-11-13", quantity=5).json()
    assert (d["movements"][0]["reel_groups"], d["movements"][0]["reels"]) == (None, None)
    # 묶음이 너무 많거나 0 이 들어 있으면 거절
    assert _move(client, h, m["id"], kind="add", movement_date="2026-11-13", reel_groups=[{"per_reel": 0, "reels": 1}]).status_code == 422
    assert _move(client, h, m["id"], kind="add", movement_date="2026-11-13", reel_groups=[{"per_reel": 1, "reels": 1}] * 101).status_code == 422
