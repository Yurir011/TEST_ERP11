"""프로젝트 납품 기록과 연간 납품 통계."""
from datetime import date, timedelta
from io import BytesIO

import openpyxl

from app.models.client import Client
from app.models.project import Project
from app.models.project_delivery import ProjectDelivery
from app.models.user import UserRole


def _project(db, me, name, client):
    p = Project(name=name, client_id=client.id, created_by=me.id)
    db.add(p)
    db.flush()
    return p


def test_add_list_update_delete_delivery(client, db, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    c = Client(name="한솔전자", created_by=me.id)
    db.add(c)
    db.flush()
    p = _project(db, me, "RF 보드", c)
    today = date.today()

    res = client.post(f"/api/projects/{p.id}/deliveries", json={"delivered_on": today.isoformat(), "quantity": 250, "memo": " 1차 납품 "}, headers=h)
    assert res.status_code == 201, res.text
    did = res.json()["id"]
    assert res.json()["memo"] == "1차 납품"

    # 미래 날짜·0개는 거절
    assert client.post(f"/api/projects/{p.id}/deliveries", json={"delivered_on": (today + timedelta(days=1)).isoformat(), "quantity": 5}, headers=h).status_code == 400
    assert client.post(f"/api/projects/{p.id}/deliveries", json={"delivered_on": today.isoformat(), "quantity": 0}, headers=h).status_code == 422

    client.post(f"/api/projects/{p.id}/deliveries", json={"delivered_on": (today - timedelta(days=3)).isoformat(), "quantity": 400}, headers=h)
    listed = client.get(f"/api/projects/{p.id}/deliveries", headers=h).json()
    assert (listed["total_count"], listed["total_quantity"]) == (2, 650)
    assert listed["items"][0]["id"] == did  # 최근 납품일이 위

    res = client.put(f"/api/projects/{p.id}/deliveries/{did}", json={"delivered_on": today.isoformat(), "quantity": 300}, headers=h)
    assert res.status_code == 200 and res.json()["quantity"] == 300
    assert client.delete(f"/api/projects/{p.id}/deliveries/{did}", headers=h).status_code == 204
    assert client.get(f"/api/projects/{p.id}/deliveries", headers=h).json()["total_count"] == 1


def test_delivery_stats_year_and_excel(client, db, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    c1, c2 = Client(name="한솔전자", created_by=me.id), Client(name="대성RF", created_by=me.id)
    db.add_all([c1, c2])
    db.flush()
    a, b = _project(db, me, "RF 보드", c1), _project(db, me, "게이트웨이", c2)
    year = date.today().year
    for pid, on, qty in [(a.id, date(year, 1, 14), 300), (a.id, date(year, 3, 19), 480), (b.id, date(year, 3, 20), 150), (a.id, date(year - 1, 1, 10), 100)]:
        db.add(ProjectDelivery(project_id=pid, delivered_on=on, quantity=qty))
    db.flush()

    res = client.get(f"/api/projects/delivery-stats?year={year}", headers=h)
    assert res.status_code == 200, res.text
    s = res.json()
    assert (s["total_count"], s["total_quantity"], s["project_count"], s["client_count"]) == (3, 930, 2, 2)
    assert [m["quantity"] for m in s["monthly"]][:3] == [300, 0, 630] and len(s["monthly"]) == 12
    assert [p["name"] for p in s["projects"]] == ["RF 보드", "게이트웨이"]  # 개수 많은 순
    assert (s["prev_count"], s["prev_quantity"]) == (1, 100)
    assert year in s["years"] and year - 1 in s["years"]

    # 통계 경로가 /{project_id} 에 먹히지 않고, 엑셀도 열린다
    res = client.get(f"/api/projects/delivery-stats/excel?year={year}", headers=h)
    assert res.status_code == 200
    ws = openpyxl.load_workbook(BytesIO(res.content)).active
    assert ws.cell(row=1, column=1).value == "프로젝트" and ws.cell(row=2, column=1).value == "RF 보드"
