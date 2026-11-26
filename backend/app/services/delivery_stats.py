"""프로젝트 납품 연간 통계: 납품 횟수·개수를 월별·프로젝트별로 모은다."""
from datetime import date

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.project import Project
from app.models.project_delivery import ProjectDelivery
from app.schemas.project_delivery import DeliveryStatsOut, MonthStat, ProjectDeliveryStat


def _same_day(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:  # 2월 29일
        return date(year, month, 28)


def build_stats(db: Session, year: int, today: date | None = None) -> DeliveryStatsOut:
    today = today or date.today()
    rows = (
        db.query(ProjectDelivery, Project, Client)
        .join(Project, Project.id == ProjectDelivery.project_id)
        .join(Client, Client.id == Project.client_id)
        .filter(extract("year", ProjectDelivery.delivered_on) == year)
        .all()
    )
    monthly = {m: [0, 0] for m in range(1, 13)}
    per_project: dict[int, dict] = {}
    clients: set[int] = set()
    for d, p, c in rows:
        m = d.delivered_on.month
        monthly[m][0] += 1
        monthly[m][1] += d.quantity
        clients.add(c.id)
        entry = per_project.setdefault(p.id, {"name": p.name, "client": c.name, "count": 0, "qty": 0, "months": {}})
        entry["count"] += 1
        entry["qty"] += d.quantity
        mm = entry["months"].setdefault(m, [0, 0])
        mm[0] += 1
        mm[1] += d.quantity

    # 작년 같은 기간: 올해이면 오늘 날짜까지, 지난 해이면 그 해 전체와 작년 전체를 견준다.
    end = today if year == today.year else date(year, 12, 31)
    prev_start, prev_end = date(year - 1, 1, 1), _same_day(year - 1, end.month, end.day)
    prev_count, prev_qty = (
        db.query(func.count(ProjectDelivery.id), func.coalesce(func.sum(ProjectDelivery.quantity), 0))
        .filter(ProjectDelivery.delivered_on >= prev_start, ProjectDelivery.delivered_on <= prev_end)
        .one()
    )
    years = sorted(
        {int(y) for (y,) in db.query(extract("year", ProjectDelivery.delivered_on)).distinct().all()} | {year, today.year},
        reverse=True,
    )
    projects = sorted(per_project.items(), key=lambda kv: (-kv[1]["qty"], -kv[1]["count"], kv[0]))
    return DeliveryStatsOut(
        year=year,
        years=years,
        total_count=sum(v[0] for v in monthly.values()),
        total_quantity=sum(v[1] for v in monthly.values()),
        project_count=len(per_project),
        client_count=len(clients),
        prev_count=int(prev_count),
        prev_quantity=int(prev_qty),
        monthly=[MonthStat(month=m, count=v[0], quantity=v[1]) for m, v in monthly.items()],
        projects=[
            ProjectDeliveryStat(
                project_id=pid,
                name=e["name"],
                client_name=e["client"],
                count=e["count"],
                quantity=e["qty"],
                months=[MonthStat(month=m, count=v[0], quantity=v[1]) for m, v in sorted(e["months"].items())],
            )
            for pid, e in projects
        ],
    )
