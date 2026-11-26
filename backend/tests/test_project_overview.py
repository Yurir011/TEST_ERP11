"""프로젝트 메인 화면용 진행 현황: 진행 중·견적(막 등록한 0%) 프로젝트만, 마감 임박순."""
from datetime import date

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
