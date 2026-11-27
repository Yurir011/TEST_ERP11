"""진행상황의 "납품" 항목: 진행률(%) 대신 완료/미완료로 쓰고, 납품 기록(project_deliveries)과 맞춘다.

- 이름이 정확히 "납품"인 진행 단계가 납품 항목이다.
- 완료 = progress_percent 100 (completed_on 은 마지막 납품일), 미완료 = 0. 납품 기록이 있으면서 완료 전이면 화면에서 "납품 중"으로 보인다.
- 납품 기록을 고치거나 지워도 완료 상태가 어긋나지 않게 이 모듈에서 맞춘다 (기록이 모두 없어지면 미완료로 되돌린다).
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.project_delivery import ProjectDelivery
from app.models.project_progress import ProjectProgressStage

DELIVERY_STAGE_NAME = "납품"


def is_delivery_stage(stage: ProjectProgressStage) -> bool:
    return (stage.name or "").strip() == DELIVERY_STAGE_NAME


def delivery_stages(db: Session, project_id: int) -> list[ProjectProgressStage]:
    return [s for s in db.query(ProjectProgressStage).filter(ProjectProgressStage.project_id == project_id).all() if is_delivery_stage(s)]


def last_delivery_date(db: Session, project_id: int):
    return db.query(func.max(ProjectDelivery.delivered_on)).filter(ProjectDelivery.project_id == project_id).scalar()


def sync_delivery_stages(db: Session, project_id: int) -> None:
    """납품 기록이 바뀐 뒤 호출한다 (commit 은 호출한 쪽에서). 이미 완료된 납품 항목의 완료일을 마지막 납품일로 맞추고,
    기록이 하나도 없으면 미완료로 되돌린다."""
    last = last_delivery_date(db, project_id)
    for stage in delivery_stages(db, project_id):
        if stage.progress_percent != 100:
            continue
        if last is None:
            stage.progress_percent = 0
            stage.completed_on = None
        else:
            stage.completed_on = last
