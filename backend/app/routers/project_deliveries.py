"""프로젝트(회차)별 납품 기록과 연간 납품 통계."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_delivery import ProjectDelivery
from app.models.project_progress import ProjectProgressStage
from app.models.user import User
from app.schemas.project_delivery import DeliveryIn, DeliveryListOut, DeliveryOut, DeliveryStatsOut, DeliveryStatusIn
from app.schemas.project_progress import ProgressStageOut
from app.services.delivery_stage import is_delivery_stage, last_delivery_date, sync_delivery_stages
from app.services.delivery_stats import build_stats
from app.services.delivery_stats_excel import generate_delivery_stats_excel

# 주의: 이 라우터는 projects 라우터보다 먼저 등록해야 /delivery-stats 가 /{project_id} 에 먹히지 않는다.
router = APIRouter(prefix="/api/projects", tags=["project-deliveries"])
logger = get_logger("ProjectDeliveries")


def _project_or_404(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    return project


def _delivery_or_404(db: Session, project_id: int, delivery_id: int) -> ProjectDelivery:
    d = db.query(ProjectDelivery).filter(ProjectDelivery.id == delivery_id, ProjectDelivery.project_id == project_id).first()
    if d is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="납품 기록을 찾을 수 없습니다.")
    return d


def _check_date(on: date) -> None:
    if on > date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="납품일은 오늘보다 뒤일 수 없습니다.")


@router.get("/delivery-stats", response_model=DeliveryStatsOut)
def delivery_stats(year: int | None = Query(default=None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    year = year or date.today().year
    logger.debug(f"[Deliveries] 연간 통계 조회: year={year}, by={current_user.id}")
    return build_stats(db, year)


@router.get("/delivery-stats/excel")
def delivery_stats_excel(year: int | None = Query(default=None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    year = year or date.today().year
    stats = build_stats(db, year)
    logger.debug(f"[Deliveries] 연간 통계 엑셀: year={year}, projects={len(stats.projects)}, by={current_user.id}")
    return Response(
        content=generate_delivery_stats_excel(stats),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/{project_id}/deliveries", response_model=DeliveryListOut)
def list_deliveries(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _project_or_404(db, project_id)
    items = (
        db.query(ProjectDelivery)
        .filter(ProjectDelivery.project_id == project_id)
        .order_by(ProjectDelivery.delivered_on.desc(), ProjectDelivery.id.desc())
        .all()
    )
    return DeliveryListOut(items=items, total_count=len(items), total_quantity=sum(d.quantity for d in items))


@router.post("/{project_id}/deliveries", response_model=DeliveryOut, status_code=status.HTTP_201_CREATED)
def add_delivery(project_id: int, payload: DeliveryIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _project_or_404(db, project_id)
    _check_date(payload.delivered_on)
    d = ProjectDelivery(
        project_id=project_id, delivered_on=payload.delivered_on, quantity=payload.quantity, memo=payload.memo, created_by=current_user.id
    )
    db.add(d)
    db.flush()
    sync_delivery_stages(db, project_id)
    db.commit()
    db.refresh(d)
    logger.debug(f"[Deliveries] 납품 등록: project_id={project_id}, on={d.delivered_on}, qty={d.quantity}, by={current_user.id}")
    return d


@router.put("/{project_id}/deliveries/{delivery_id}", response_model=DeliveryOut)
def update_delivery(
    project_id: int, delivery_id: int, payload: DeliveryIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    d = _delivery_or_404(db, project_id, delivery_id)
    _check_date(payload.delivered_on)
    d.delivered_on, d.quantity, d.memo = payload.delivered_on, payload.quantity, payload.memo
    db.flush()
    sync_delivery_stages(db, project_id)
    db.commit()
    db.refresh(d)
    logger.debug(f"[Deliveries] 납품 수정: id={delivery_id}, by={current_user.id}")
    return d


@router.delete("/{project_id}/deliveries/{delivery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_delivery(project_id: int, delivery_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = _delivery_or_404(db, project_id, delivery_id)
    db.delete(d)
    db.flush()
    sync_delivery_stages(db, project_id)
    db.commit()
    logger.debug(f"[Deliveries] 납품 삭제: id={delivery_id}, by={current_user.id}")
    return None


@router.put("/{project_id}/progress-stages/{stage_id}/delivery-status", response_model=ProgressStageOut)
def set_delivery_status(
    project_id: int, stage_id: int, payload: DeliveryStatusIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """"납품" 진행 단계를 완료/미완료로 바꾼다. 완료하려면 납품 기록이 1건 이상 있어야 하고(완료일은 마지막 납품일),
    미완료로 되돌려도 납품 기록은 그대로 남는다. 분할 납품은 기록을 여러 건 쌓은 뒤 마지막에 완료로 바꾼다."""
    stage = db.query(ProjectProgressStage).filter(ProjectProgressStage.id == stage_id, ProjectProgressStage.project_id == project_id).first()
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="진행 상황 항목을 찾을 수 없습니다.")
    if not is_delivery_stage(stage):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이름이 \"납품\"인 항목에서만 사용할 수 있습니다.")
    if payload.completed:
        last = last_delivery_date(db, project_id)
        if last is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="납품일과 개수를 먼저 기록해 주세요.")
        stage.progress_percent = 100
        stage.completed_on = last
    else:
        stage.progress_percent = 0
        stage.completed_on = None
    db.commit()
    db.refresh(stage)
    logger.debug(f"[Deliveries] 납품 항목 상태 변경: stage_id={stage_id}, completed={payload.completed}, by={current_user.id}")
    return stage
