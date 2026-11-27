"""프로젝트 회차(묶음) 번호 계산."""
from sqlalchemy.orm import Session

from app.models.project import Project


def round_info(db: Session, projects: list[Project]) -> dict[int, tuple[int, int]]:
    """묶음(series)에 속한 프로젝트의 회차 번호와 묶음의 회차 수를 {id: (번호, 수)} 로 계산한다.

    번호는 저장하지 않는다. 묶음의 모든 구성원을 해(年)와 상관없이 시작일(없으면 등록일) 순으로 세어 1부터 매긴다.
    (연차 과제처럼 해가 다른 회차도 한 묶음의 탭·카드 하나로 보이게 한다. 이름은 round_label 로 따로 붙일 수 있다.)
    """
    series_ids = {p.series_id for p in projects if p.series_id is not None}
    if not series_ids:
        return {}
    members = db.query(Project).filter(Project.series_id.in_(series_ids)).all()
    by_series: dict[int, list[Project]] = {}
    for m in members:
        by_series.setdefault(m.series_id, []).append(m)
    info: dict[int, tuple[int, int]] = {}
    for rows in by_series.values():
        rows.sort(key=lambda m: (m.start_date or m.created_at.date(), m.id))
        for no, m in enumerate(rows, start=1):
            info[m.id] = (no, len(rows))
    return info
