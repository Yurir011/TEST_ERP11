"""프로젝트 메인 화면용 진행 현황: 진행 중·견적(막 등록한 0%) 프로젝트만, 마감 임박순."""
from datetime import date, timedelta

from app.models.client import Client
from app.models.project import Project, ProjectStatus
from app.models.user import UserRole


def test_progress_overview_in_progress_and_estimate_sorted_by_due(client, db, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    c = Client(name="한빛통신", created_by=me.id)
    db.add(c)
    db.flush()
    for name, st, end in [
        ("C", ProjectStatus.in_progress, None),
        ("B", ProjectStatus.estimate, None),
        ("A", ProjectStatus.in_progress, date(2026, 12, 1)),
        ("D", ProjectStatus.completed, None),
        ("E", ProjectStatus.discarded, None),
    ]:
        db.add(Project(name=name, client_id=c.id, status=st, end_date=end, created_by=me.id))
    db.flush()
    res = client.get("/api/projects/progress-overview", headers=auth_headers(me))
    assert res.status_code == 200, res.text
    assert [p["name"] for p in res.json()] == ["A", "C", "B"]


def test_progress_overview_merges_rounds_into_one_card(client, db, make_user, auth_headers):
    me = make_user(role=UserRole.employee)
    c = Client(name="한솔전자", created_by=me.id)
    db.add(c)
    db.flush()
    year = date.today().year
    r1 = Project(name="중계기", client_id=c.id, status=ProjectStatus.completed, start_date=date(year, 1, 5), created_by=me.id)
    db.add(r1)
    db.flush()
    r1.series_id = r1.id
    r2 = Project(name="중계기", client_id=c.id, status=ProjectStatus.in_progress, start_date=date(year, 5, 5), series_id=r1.id, created_by=me.id)
    r3 = Project(name="중계기", client_id=c.id, status=ProjectStatus.estimate, start_date=date(year, 9, 5), series_id=r1.id, created_by=me.id)
    solo = Project(name="단독", client_id=c.id, status=ProjectStatus.estimate, created_by=me.id)
    db.add_all([r2, r3, solo])
    db.flush()

    rows = client.get("/api/projects/progress-overview", headers=auth_headers(me)).json()
    names = sorted(r["name"] for r in rows)
    assert names == ["단독", "중계기"]  # 회차가 여러 개여도 카드는 하나
    card = next(r for r in rows if r["name"] == "중계기")
    assert card["id"] == r2.id and card["round_no"] == 2 and card["round_total"] == 3  # 진행 중인 회차가 대표

    # 진행 상태가 아니어도 시작했고 100% 미만이면 활성: 앞 회차가 대표
    r2.status = ProjectStatus.estimate
    db.flush()
    rows = client.get("/api/projects/progress-overview", headers=auth_headers(me)).json()
    assert next(r for r in rows if r["name"] == "중계기")["id"] == r2.id

    # 시작 전(진행 예정) 회차는 시작일이 되기 전엔 그래프에 올리지 않고, 활성 회차가 없으면 카드도 없다
    r2.status = ProjectStatus.completed
    r3.start_date = date.today() + timedelta(days=30)
    db.flush()
    rows = client.get("/api/projects/progress-overview", headers=auth_headers(me)).json()
    assert [r for r in rows if r["name"] == "중계기"] == []


def test_overview_merges_rounds_of_different_years_and_prefers_in_progress(client, db, make_user, auth_headers):
    """2026년(진행 중·100%)과 2027년(견적·0%) 회차는 해가 달라도 카드 하나이고, 진행 중인 2026 회차가 대표다."""
    me = make_user(role=UserRole.employee)
    c = Client(name="사내프로젝트", created_by=me.id)
    db.add(c)
    db.flush()
    a = Project(name="바이오마커 과제", client_id=c.id, status=ProjectStatus.in_progress, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), created_by=me.id)
    db.add(a)
    db.flush()
    a.series_id = a.id
    b = Project(name="바이오마커 과제", client_id=c.id, status=ProjectStatus.estimate, start_date=date(2027, 1, 1), end_date=date(2027, 12, 31), series_id=a.id, created_by=me.id)
    db.add(b)
    db.flush()
    rows = client.get("/api/projects/progress-overview", headers=auth_headers(me)).json()
    assert [r["id"] for r in rows] == [a.id]
    assert (rows[0]["round_no"], rows[0]["round_total"]) == (1, 2)
