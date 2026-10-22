"""스케줄 반복 일정: 하나만 삭제 / 반복 전체 삭제."""
from app.models.user import UserRole


def _make_series(client, headers):
    r = client.post(
        "/api/schedule",
        json={"title": "주간 회의", "start_date": "2026-11-02", "end_date": "2026-11-02", "recurrence_freq": "daily", "recurrence_until": "2026-11-05"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    listed = client.get("/api/schedule?start=2026-11-01&end=2026-11-30", headers=headers).json()
    return [e for e in listed if e["title"] == "주간 회의"]


def test_delete_one_keeps_the_rest_of_the_series(client, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    events = _make_series(client, h)
    assert len(events) == 4
    assert client.delete(f"/api/schedule/{events[1]['id']}", headers=h).status_code == 204
    assert len(client.get("/api/schedule?start=2026-11-01&end=2026-11-30", headers=h).json()) == 3


def test_delete_series_removes_every_occurrence(client, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    events = _make_series(client, h)
    # 같은 사람의 반복 아닌 일정은 그대로 남는다
    client.post("/api/schedule", json={"title": "단발", "start_date": "2026-11-03", "end_date": "2026-11-03"}, headers=h)
    assert client.delete(f"/api/schedule/{events[2]['id']}?series=true", headers=h).status_code == 204
    left = client.get("/api/schedule?start=2026-11-01&end=2026-11-30", headers=h).json()
    assert [e["title"] for e in left] == ["단발"]


def test_series_flag_on_a_single_event_deletes_only_that_event(client, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    one = client.post("/api/schedule", json={"title": "단발", "start_date": "2026-11-03", "end_date": "2026-11-03"}, headers=h).json()
    other = client.post("/api/schedule", json={"title": "다른 단발", "start_date": "2026-11-04", "end_date": "2026-11-04"}, headers=h).json()
    assert client.delete(f"/api/schedule/{one['id']}?series=true", headers=h).status_code == 204
    left = client.get("/api/schedule?start=2026-11-01&end=2026-11-30", headers=h).json()
    assert [e["id"] for e in left] == [other["id"]]


def test_other_employee_cannot_delete_series(client, make_user, auth_headers):
    owner = make_user(role=UserRole.employee)
    stranger = make_user(role=UserRole.employee)
    events = _make_series(client, auth_headers(owner))
    assert client.delete(f"/api/schedule/{events[0]['id']}?series=true", headers=auth_headers(stranger)).status_code == 403
    assert len(client.get("/api/schedule?start=2026-11-01&end=2026-11-30", headers=auth_headers(owner)).json()) == 4
