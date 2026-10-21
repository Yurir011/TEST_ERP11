"""연차 잔여: 근로기준법 자동 발생 + 관리자 조정 − 사용, 당겨 쓰기(마이너스)와 다음 주기 이월 차감."""
from datetime import date

from app.models.leave import LeaveRequest, LeaveStatus
from app.models.user import JobTitle, UserRole
from app.services.leave_balance import compute_balance


def _leave(db, user, start, end, days, status=LeaveStatus.approved):
    db.add(LeaveRequest(user_id=user.id, start_date=start, end_date=end, days=days, reason="테스트", status=status))
    db.flush()


def test_auto_grant_follows_hire_date_and_used_reduces_remaining(db, make_user):
    me = make_user()
    me.hire_date = date(2025, 1, 1)
    _leave(db, me, date(2025, 3, 3), date(2025, 3, 5), 3)
    b = compute_balance(db, me, date(2025, 4, 15))
    assert (b.auto_granted, b.adjustment, b.granted, b.used, b.remaining) == (3, 0, 3, 3, 0)  # 만근 3개월 → 3일
    assert (b.period_start, b.period_end, b.hire_date) == (date(2025, 1, 1), date(2026, 1, 1), date(2025, 1, 1))

    me.hire_date = date(2024, 4, 15)  # 입사일을 바꾸면 발생 일수도 바로 달라진다 (만 1년 → 15일)
    assert compute_balance(db, me, date(2025, 4, 15)).auto_granted == 15


def test_advance_use_shows_negative_remaining(db, make_user):
    me = make_user()
    me.hire_date = date(2025, 1, 1)
    _leave(db, me, date(2025, 4, 1), date(2025, 4, 7), 5)
    b = compute_balance(db, me, date(2025, 4, 15))  # 3일 발생했는데 5일 사용
    assert b.remaining == -2
    assert b.advance_limit == 15  # 다음 주기(만 1년)에 발생할 연차만큼 당겨 쓸 수 있다


def test_deficit_is_carried_into_next_period(db, make_user):
    me = make_user()
    me.hire_date = date(2023, 1, 1)
    _leave(db, me, date(2023, 6, 1), date(2023, 6, 30), 15)  # 1주기(발생 11일) 15일 사용 → 4일 당겨 씀
    b = compute_balance(db, me, date(2024, 6, 1))
    assert (b.auto_granted, b.carried_deficit, b.remaining) == (15, 4, 11)  # 15일 − 이월 4일
    _leave(db, me, date(2024, 7, 1), date(2024, 7, 31), 18)  # 2주기(15일) 18일 + 이월 4일 → 7일 부족
    assert compute_balance(db, me, date(2025, 6, 1)).carried_deficit == 7
    # 반려·대기 건은 이월에 들어가지 않는다
    _leave(db, me, date(2023, 8, 1), date(2023, 8, 31), 20, status=LeaveStatus.rejected)
    assert compute_balance(db, me, date(2024, 6, 1)).carried_deficit == 4


def test_request_beyond_remaining_is_allowed_up_to_advance_limit(client, db, make_user, auth_headers):
    me = make_user()
    me.hire_date = date(2025, 1, 1)
    h = auth_headers(me)
    ok = client.post("/api/leaves", json={"start_date": "2025-03-03", "end_date": "2025-03-07", "reason": "휴가", "is_final_decision": True}, headers=h)
    assert ok.status_code == 201, ok.text  # 3월 3일 기준 2일 발생인데 5일 신청 → 당겨 쓰기
    assert compute_balance(db, me, date(2025, 3, 10)).remaining == -3
    too_many = client.post("/api/leaves", json={"start_date": "2025-04-01", "end_date": "2025-04-28", "reason": "너무 많이", "is_final_decision": True}, headers=h)
    assert too_many.status_code == 400 and "한도" in too_many.json()["detail"]


def test_admin_adjustment_changes_granted_days(client, db, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표")
    staff = make_user(name="직원")
    staff.hire_date = date(2024, 1, 1)
    # 직원은 조정할 수 없다
    body = {"user_id": staff.id, "days": 2, "reason": "포상 휴가", "effective_date": "2025-02-01"}
    assert client.post("/api/leaves/adjustments", json=body, headers=auth_headers(staff)).status_code == 403
    assert client.get("/api/leaves/balances", headers=auth_headers(staff)).status_code == 403

    created = client.post("/api/leaves/adjustments", json=body, headers=auth_headers(admin))
    assert created.status_code == 201, created.text
    assert (created.json()["days"], created.json()["created_by_name"]) == (2, "대표")
    b = compute_balance(db, staff, date(2025, 3, 1))
    assert (b.auto_granted, b.adjustment, b.granted, b.remaining) == (15, 2, 17, 17)
    # 효력일이 다른 주기면 그 주기에만 반영된다
    assert compute_balance(db, staff, date(2026, 3, 1)).adjustment == 0

    client.post("/api/leaves/adjustments", json={"user_id": staff.id, "days": -1, "reason": "정정", "effective_date": "2025-02-02"}, headers=auth_headers(admin))
    assert compute_balance(db, staff, date(2025, 3, 1)).adjustment == 1

    rows = client.get("/api/leaves/balances", headers=auth_headers(admin)).json()
    assert any(r["user_id"] == staff.id and r["user_name"] == "직원" for r in rows)
    listed = client.get(f"/api/leaves/adjustments?user_id={staff.id}", headers=auth_headers(admin)).json()
    assert [a["days"] for a in listed] == [-1, 2]

    assert client.delete(f"/api/leaves/adjustments/{listed[0]['id']}", headers=auth_headers(admin)).status_code == 204
    assert client.post("/api/leaves/adjustments", json={**body, "days": 0}, headers=auth_headers(admin)).status_code == 422
    assert client.post("/api/leaves/adjustments", json={**body, "reason": "  "}, headers=auth_headers(admin)).status_code == 422
