"""메신저 전체 목록(상태·즐겨찾기), 내 상태 변경, 출퇴근·연차와의 연결, 실시간 반영."""
from contextlib import nullcontext
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import event

from app.core.security import create_access_token
from app.database import engine
from app.models.attendance import Attendance
from app.models.leave import LeaveRequest, LeaveStatus
from app.models.presence import MessengerFavorite, UserPresence
from app.models.user import JobTitle, UserRole
from app.routers import messenger_ws
from app.services.presence import ABSENT, MANUAL_STATUSES, effective_status, statuses_for

BASE = "/api/messenger"
TODAY = date.today()


# ── 상태 계산 (순수 규칙) ──────────────────────────────────────────

def manual(status, day=TODAY):
    return UserPresence(user_id=1, status=status, status_date=day)


def attendance(clock_in=True, clock_out=False):
    now = datetime.now(timezone.utc)
    return Attendance(user_id=1, work_date=TODAY, clock_in=now if clock_in else None, clock_out=now if clock_out else None)


def test_status_defaults_to_absent_before_clock_in():
    assert effective_status(None, None, False, TODAY) == ABSENT
    assert effective_status(None, attendance(clock_in=False), False, TODAY) == ABSENT


def test_status_follows_clock_in_and_out():
    assert effective_status(None, attendance(), False, TODAY) == "working"
    assert effective_status(None, attendance(clock_out=True), False, TODAY) == "off"


def test_approved_leave_today_shows_leave_even_before_clock_in():
    assert effective_status(None, None, True, TODAY) == "leave"


def test_manual_status_today_wins_over_everything():
    assert effective_status(manual("outside"), attendance(), True, TODAY) == "outside"
    assert effective_status(manual("meeting"), None, False, TODAY) == "meeting"


def test_manual_status_from_a_previous_day_is_ignored_next_morning():
    yesterday = TODAY - timedelta(days=1)
    assert effective_status(manual("trip", yesterday), None, False, TODAY) == ABSENT
    assert effective_status(manual("trip", yesterday), None, True, TODAY) == "leave"


def test_unknown_stored_status_is_ignored():
    assert effective_status(manual("weird"), attendance(), False, TODAY) == "working"


# ── 데이터로 계산 ──────────────────────────────────────────────────

def make_leave(db, user, start, end, status=LeaveStatus.approved):
    db.add(LeaveRequest(user_id=user.id, start_date=start, end_date=end, days=1, reason="휴가", status=status))
    db.flush()


@pytest.fixture()
def people(make_user):
    return {"me": make_user(name="나"), "a": make_user(name="가"), "b": make_user(name="나나"), "c": make_user(name="다")}


def test_statuses_for_uses_leave_attendance_and_manual(db, people):
    a, b, c = people["a"], people["b"], people["c"]
    make_leave(db, a, TODAY - timedelta(days=1), TODAY + timedelta(days=1))
    db.add(Attendance(user_id=b.id, work_date=TODAY, clock_in=datetime.now(timezone.utc)))
    db.add(UserPresence(user_id=c.id, status="trip", status_date=TODAY))
    db.flush()
    assert statuses_for(db, [a.id, b.id, c.id, people["me"].id], TODAY) == {a.id: "leave", b.id: "working", c.id: "trip", people["me"].id: ABSENT}


@pytest.mark.parametrize("status", [LeaveStatus.pending, LeaveStatus.rejected])
def test_unapproved_leave_does_not_count(db, people, status):
    make_leave(db, people["a"], TODAY, TODAY, status)
    assert statuses_for(db, [people["a"].id], TODAY) == {people["a"].id: ABSENT}


def test_leave_outside_today_does_not_count(db, people):
    make_leave(db, people["a"], TODAY + timedelta(days=1), TODAY + timedelta(days=2))
    make_leave(db, people["b"], TODAY - timedelta(days=3), TODAY - timedelta(days=1))
    assert set(statuses_for(db, [people["a"].id, people["b"].id], TODAY).values()) == {ABSENT}


def test_statuses_for_empty():
    assert statuses_for(None, [], TODAY) == {}  # type: ignore[arg-type]


# ── 전체 목록 API ──────────────────────────────────────────────────

@pytest.fixture()
def api(client, auth_headers):
    class Api:
        def get(self, user, path):
            return client.get(BASE + path, headers=auth_headers(user))

        def put(self, user, path, **kw):
            return client.put(BASE + path, headers=auth_headers(user), **kw)

        def delete(self, user, path):
            return client.delete(BASE + path, headers=auth_headers(user))

    return Api()


def test_directory_lists_other_active_users_with_status_and_favorite_flag(api, people, make_user, db):
    make_user(name="퇴사자", is_active=False)
    db.add(UserPresence(user_id=people["a"].id, status="outside", status_date=TODAY))
    db.flush()
    api.put(people["me"], f"/favorites/{people['b'].id}")

    rows = {r["name"]: r for r in api.get(people["me"], "/directory").json()}
    assert set(rows) == {"가", "나나", "다"}  # 나 자신과 퇴사자는 없다
    assert rows["가"]["status"] == "outside" and rows["가"]["is_favorite"] is False
    assert rows["나나"]["is_favorite"] is True and rows["나나"]["status"] == ABSENT
    assert set(rows["가"]) == {"id", "name", "grade", "title", "status", "is_favorite"}  # 이메일·주소 등은 주지 않는다
    assert [r["name"] for r in api.get(people["me"], "/directory").json()] == sorted(rows)


def test_directory_query_count_is_fixed(client, api, people, make_user, auth_headers):
    def count() -> int:
        n = {"v": 0}

        def on_exec(*_a):
            n["v"] += 1

        event.listen(engine, "before_cursor_execute", on_exec)
        try:
            assert client.get(BASE + "/directory", headers=auth_headers(people["me"])).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", on_exec)
        return n["v"]

    few = count()
    for i in range(10):
        make_user(name=f"추가{i}")
    assert count() <= few + 0 and count() <= 8


def test_directory_requires_login(client):
    assert client.get(BASE + "/directory").status_code == 401
    assert client.get(BASE + "/status").status_code == 401
    assert client.put(BASE + "/status", json={"status": "meal"}).status_code == 401
    assert client.put(BASE + "/favorites/1").status_code == 401


# ── 내 상태 ────────────────────────────────────────────────────────

def test_my_status_defaults_and_can_be_changed_by_me_only(api, people):
    assert api.get(people["me"], "/status").json() == {"status": ABSENT}
    assert api.put(people["me"], "/status", json={"status": "outside"}).json() == {"status": "outside"}
    assert api.get(people["me"], "/status").json() == {"status": "outside"}
    # 다른 사람 화면에서는 내 새 상태가 보이고, 다른 사람의 상태는 그대로다
    seen = {r["name"]: r["status"] for r in api.get(people["a"], "/directory").json()}
    assert seen["나"] == "outside" and seen["나나"] == ABSENT
    assert api.get(people["a"], "/status").json() == {"status": ABSENT}


@pytest.mark.parametrize("status", list(MANUAL_STATUSES))
def test_every_selectable_status_is_accepted(api, people, status):
    assert api.put(people["me"], "/status", json={"status": status}).json() == {"status": status}


@pytest.mark.parametrize("bad", ["absent", "미출근", "", "admin", None, 3])
def test_unknown_status_is_rejected(api, people, bad):
    assert api.put(people["me"], "/status", json={"status": bad}).status_code == 422


def test_status_is_overwritten_not_duplicated_and_resets_next_day(api, people, db):
    api.put(people["me"], "/status", json={"status": "meeting"})
    api.put(people["me"], "/status", json={"status": "meal"})
    assert db.query(UserPresence).filter(UserPresence.user_id == people["me"].id).count() == 1
    row = db.query(UserPresence).one()
    row.status_date = TODAY - timedelta(days=1)  # 하루가 지났다
    db.flush()
    assert api.get(people["me"], "/status").json() == {"status": ABSENT}


def test_status_changes_are_not_written_to_the_audit_log(api, people, db):
    from app.models.audit_log import AuditLog

    before = db.query(AuditLog).count()
    api.put(people["me"], "/status", json={"status": "trip"})
    api.put(people["me"], f"/favorites/{people['a'].id}")
    assert db.query(AuditLog).count() == before


# ── 출퇴근·연차와의 연결 ───────────────────────────────────────────

def test_clock_in_sets_status_to_working_and_clock_out_to_off(client, api, people, auth_headers):
    me = people["me"]
    assert client.post("/api/attendance/clock-in", headers=auth_headers(me)).status_code == 200
    assert api.get(me, "/status").json() == {"status": "working"}
    assert {r["name"]: r["status"] for r in api.get(people["a"], "/directory").json()}["나"] == "working"
    assert client.post("/api/attendance/clock-out", headers=auth_headers(me)).status_code == 200
    assert api.get(me, "/status").json() == {"status": "off"}


def test_clock_in_overrides_a_status_chosen_earlier_today(client, api, people, auth_headers):
    api.put(people["me"], "/status", json={"status": "leave"})  # 반차 등으로 미리 골라 둠
    client.post("/api/attendance/clock-in", headers=auth_headers(people["me"]))
    assert api.get(people["me"], "/status").json() == {"status": "working"}


def test_status_chosen_after_clock_in_wins(client, api, people, auth_headers):
    client.post("/api/attendance/clock-in", headers=auth_headers(people["me"]))
    api.put(people["me"], "/status", json={"status": "outside"})
    assert api.get(people["me"], "/status").json() == {"status": "outside"}


def test_failed_clock_in_does_not_change_status(client, api, people, auth_headers):
    client.post("/api/attendance/clock-in", headers=auth_headers(people["me"]))
    api.put(people["me"], "/status", json={"status": "meal"})
    again = client.post("/api/attendance/clock-in", headers=auth_headers(people["me"]))  # 이미 출근함 → 400
    assert again.status_code == 400
    assert api.get(people["me"], "/status").json() == {"status": "meal"}


def test_approved_leave_today_shows_leave_without_clock_in(api, people, db):
    make_leave(db, people["me"], TODAY, TODAY)
    assert api.get(people["me"], "/status").json() == {"status": "leave"}
    assert {r["name"]: r["status"] for r in api.get(people["a"], "/directory").json()}["나"] == "leave"


# ── 즐겨찾기 ───────────────────────────────────────────────────────

def test_favorite_add_remove_are_idempotent(api, people, db):
    a = people["a"].id
    assert api.put(people["me"], f"/favorites/{a}").json() == {"user_id": a, "is_favorite": True}
    assert api.put(people["me"], f"/favorites/{a}").json() == {"user_id": a, "is_favorite": True}
    assert db.query(MessengerFavorite).count() == 1
    assert api.delete(people["me"], f"/favorites/{a}").json() == {"user_id": a, "is_favorite": False}
    assert api.delete(people["me"], f"/favorites/{a}").json() == {"user_id": a, "is_favorite": False}
    assert db.query(MessengerFavorite).count() == 0


def test_favorites_are_private(api, people):
    api.put(people["me"], f"/favorites/{people['a'].id}")
    api.put(people["me"], f"/favorites/{people['b'].id}")
    # 다른 사람(가)의 전체 목록에는 내 즐겨찾기가 하나도 반영되지 않는다 (즐겨찾기당한 사람도, 다른 사람도 알 수 없다)
    seen_by_a = {r["name"]: r["is_favorite"] for r in api.get(people["a"], "/directory").json()}
    assert seen_by_a == {"나": False, "나나": False, "다": False}
    seen_by_c = {r["name"]: r["is_favorite"] for r in api.get(people["c"], "/directory").json()}
    assert not any(seen_by_c.values())
    assert {r["name"]: r["is_favorite"] for r in api.get(people["me"], "/directory").json()} == {"가": True, "나나": True, "다": False}


def test_cannot_favorite_self_unknown_or_inactive(api, people, make_user):
    assert api.put(people["me"], f"/favorites/{people['me'].id}").status_code == 400
    assert api.put(people["me"], "/favorites/999999").status_code == 404
    gone = make_user(name="퇴사자", is_active=False)
    assert api.put(people["me"], f"/favorites/{gone.id}").status_code == 404


def test_favorites_disappear_with_the_user(db, people):
    db.add(MessengerFavorite(user_id=people["me"].id, favorite_user_id=people["a"].id))
    db.flush()
    db.delete(people["a"])
    db.flush()
    assert db.query(MessengerFavorite).count() == 0


def test_db_refuses_self_favorite(db, people):
    from sqlalchemy.exc import IntegrityError

    db.add(MessengerFavorite(user_id=people["me"].id, favorite_user_id=people["me"].id))
    with pytest.raises(IntegrityError):
        db.flush()


def test_all_roles_can_use_directory(api, people, make_user):
    ceo = make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표")
    site = make_user(role=UserRole.site_admin, name="사이트관리자")
    for user in (ceo, site):
        assert api.get(user, "/directory").status_code == 200
        assert api.put(user, "/status", json={"status": "meeting"}).status_code == 200


# ── 실시간 ─────────────────────────────────────────────────────────

@pytest.fixture()
def ws_session(db, monkeypatch):
    monkeypatch.setattr(messenger_ws, "open_session", lambda: nullcontext(db))
    monkeypatch.setattr(messenger_ws, "AUTH_TIMEOUT_SECONDS", 0.5)


def connect(client, user):
    cm = client.websocket_connect("/api/ws")
    ws = cm.__enter__()
    ws.send_json({"type": "auth", "token": create_access_token(user.email)})
    assert ws.receive_json() == {"type": "ready"}
    return cm, ws


def idle(ws):
    ws.send_json({"type": "ping"})
    return ws.receive_json()


def test_status_change_is_broadcast_to_everyone_connected(client, api, people, ws_session):
    cm_a, ws_a = connect(client, people["a"])
    cm_me, ws_me = connect(client, people["me"])
    try:
        api.put(people["me"], "/status", json={"status": "outside"})
        expected = {"type": "presence.updated", "user_id": people["me"].id, "status": "outside"}
        assert ws_a.receive_json() == expected  # 대화방이 없는 사람에게도
        assert ws_me.receive_json() == expected  # 내 다른 창에도
    finally:
        cm_a.__exit__(None, None, None)
        cm_me.__exit__(None, None, None)


def test_clock_in_is_broadcast_as_working(client, people, auth_headers, ws_session):
    cm_a, ws_a = connect(client, people["a"])
    try:
        client.post("/api/attendance/clock-in", headers=auth_headers(people["me"]))
        assert ws_a.receive_json() == {"type": "presence.updated", "user_id": people["me"].id, "status": "working"}
        client.post("/api/attendance/clock-out", headers=auth_headers(people["me"]))
        assert ws_a.receive_json() == {"type": "presence.updated", "user_id": people["me"].id, "status": "off"}
    finally:
        cm_a.__exit__(None, None, None)


def test_favorite_change_is_sent_to_my_own_windows_only(client, api, people, ws_session):
    cm_me, ws_me = connect(client, people["me"])
    cm_a, ws_a = connect(client, people["a"])
    try:
        api.put(people["me"], f"/favorites/{people['b'].id}")
        assert ws_me.receive_json() == {"type": "favorites.updated"}
        assert idle(ws_a) == {"type": "pong"}  # 다른 사람에게는 아무것도 가지 않는다
        api.delete(people["me"], f"/favorites/{people['b'].id}")
        assert ws_me.receive_json() == {"type": "favorites.updated"}
        api.delete(people["me"], f"/favorites/{people['b'].id}")  # 이미 없으면 알림도 없다
        assert idle(ws_me) == {"type": "pong"}
    finally:
        cm_me.__exit__(None, None, None)
        cm_a.__exit__(None, None, None)


def test_failed_status_request_sends_nothing(client, api, people, ws_session):
    cm_a, ws_a = connect(client, people["a"])
    try:
        api.put(people["me"], "/status", json={"status": "absent"})  # 422
        assert idle(ws_a) == {"type": "pong"}
    finally:
        cm_a.__exit__(None, None, None)
