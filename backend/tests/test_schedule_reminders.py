"""일정 알림: 시점 저장과 '오늘 알릴 일정' 조회."""
from app.models.user import UserRole


def _make(client, h, title, start, end=None, remind=None, **extra):
    body = {"title": title, "start_date": start, "end_date": end or start, "remind_days_before": remind, **extra}
    r = client.post("/api/schedule", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _titles(client, h, on):
    r = client.get(f"/api/schedule/reminders?on={on}", headers=h)
    assert r.status_code == 200, r.text
    return [e["title"] for e in r.json()]


def test_remind_value_is_saved_and_validated(client, make_user, auth_headers):
    h = auth_headers(make_user(role=UserRole.employee))
    assert _make(client, h, "알림 없음", "2026-11-12")["remind_days_before"] is None
    assert _make(client, h, "당일", "2026-11-12", remind=0)["remind_days_before"] == 0
    bad = client.post("/api/schedule", json={"title": "x", "start_date": "2026-11-12", "end_date": "2026-11-12", "remind_days_before": 2}, headers=h)
    assert bad.status_code == 422


def test_reminders_follow_the_chosen_lead_time(client, make_user, auth_headers):
    h = auth_headers(make_user(role=UserRole.employee))
    _make(client, h, "알림 없음", "2026-11-12")
    _make(client, h, "당일", "2026-11-12", remind=0)
    _make(client, h, "하루 전", "2026-11-12", remind=1)
    _make(client, h, "일주일 전", "2026-11-12", remind=7)
    assert _titles(client, h, "2026-11-04") == []
    assert _titles(client, h, "2026-11-05") == ["일주일 전"]
    assert _titles(client, h, "2026-11-11") == ["하루 전", "일주일 전"]
    assert _titles(client, h, "2026-11-12") == ["당일", "하루 전", "일주일 전"]  # 시작일이 같으면 등록 순
    assert _titles(client, h, "2026-11-13") == []  # 끝난 일정은 더 알리지 않는다


def test_multi_day_event_keeps_reminding_until_it_ends(client, make_user, auth_headers):
    h = auth_headers(make_user(role=UserRole.employee))
    _make(client, h, "출장", "2026-11-12", end="2026-11-14", remind=0)
    assert _titles(client, h, "2026-11-13") == ["출장"]
    assert _titles(client, h, "2026-11-15") == []


def test_completed_events_and_other_peoples_events_are_not_reminded(client, make_user, auth_headers):
    mine = auth_headers(make_user(role=UserRole.employee))
    other = auth_headers(make_user(role=UserRole.employee))
    done = _make(client, mine, "끝낸 일", "2026-11-12", remind=0)
    _make(client, mine, "남은 일", "2026-11-12", remind=0)
    _make(client, other, "남의 일", "2026-11-12", remind=0)
    assert client.put(f"/api/schedule/{done['id']}/complete", headers=mine).status_code == 200
    assert _titles(client, mine, "2026-11-12") == ["남은 일"]


def test_update_changes_the_reminder(client, make_user, auth_headers):
    h = auth_headers(make_user(role=UserRole.employee))
    ev = _make(client, h, "회의", "2026-11-12", remind=0)
    body = {"title": "회의", "start_date": "2026-11-12", "end_date": "2026-11-12", "remind_days_before": None}
    assert client.put(f"/api/schedule/{ev['id']}", json=body, headers=h).json()["remind_days_before"] is None
    assert _titles(client, h, "2026-11-12") == []
