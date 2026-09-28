from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_progress import (
    MAX_PROGRESS_STAGES,
    PURCHASE_STEP_LABELS,
    ProjectProgressStage,
    ProjectPurchaseStep,
    PurchaseStepKey,
)
from app.models.user import User
from app.schemas.project_progress import (
    ProgressStageCreate,
    ProgressStageOut,
    ProgressStageProgressUpdate,
    ProgressStageScheduleUpdate,
    PurchaseStepOut,
    PurchaseStepRename,
)

router = APIRouter(prefix="/api/projects", tags=["project-progress"])
logger = get_logger("ProjectProgress")


def _get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    return project


def _purchase_step_out(step: ProjectPurchaseStep) -> PurchaseStepOut:
    return PurchaseStepOut(
        id=step.id,
        step_key=step.step_key,
        label=step.custom_label or PURCHASE_STEP_LABELS[step.step_key],
        order_index=step.order_index,
        is_done=step.is_done,
        completed_on=step.completed_on,
    )


def _ensure_purchase_steps(db: Session, project: Project) -> list[ProjectPurchaseStep]:
    """이 기능 추가 이전에 생성된 프로젝트에도 구매 진행 5단계를 지연 생성한다."""
    if project.purchase_steps:
        return list(project.purchase_steps)

    steps = [
        ProjectPurchaseStep(project_id=project.id, step_key=key, order_index=i)
        for i, key in enumerate(PurchaseStepKey, start=1)
    ]
    db.add_all(steps)
    db.commit()
    for step in steps:
        db.refresh(step)
    logger.debug(f"[ProjectProgress] 구매 진행 5단계 자동 생성: project_id={project.id}")
    return steps


@router.get("/{project_id}/progress-stages", response_model=list[ProgressStageOut])
def list_progress_stages(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    project = _get_project_or_404(db, project_id)
    return project.progress_stages


@router.post("/{project_id}/progress-stages", response_model=ProgressStageOut, status_code=status.HTTP_201_CREATED)
def create_progress_stage(
    project_id: int,
    payload: ProgressStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(db, project_id)
    logger.debug(f"[ProjectProgress] 진행 상황 단계 추가 시도: project_id={project_id}, name={payload.name}")

    if len(project.progress_stages) >= MAX_PROGRESS_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"진행 상황 항목은 최대 {MAX_PROGRESS_STAGES}개까지 등록할 수 있습니다.",
        )

    next_order = max((s.order_index for s in project.progress_stages), default=0) + 1
    stage = ProjectProgressStage(project_id=project_id, name=payload.name, order_index=next_order)
    db.add(stage)
    db.commit()
    db.refresh(stage)
    logger.debug(f"[ProjectProgress] 진행 상황 단계 추가 완료: id={stage.id}, project_id={project_id}")
    return stage


@router.delete("/{project_id}/progress-stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_progress_stage(
    project_id: int, stage_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    stage = (
        db.query(ProjectProgressStage)
        .filter(ProjectProgressStage.id == stage_id, ProjectProgressStage.project_id == project_id)
        .first()
    )
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="진행 상황 항목을 찾을 수 없습니다.")

    db.delete(stage)
    db.commit()
    logger.debug(f"[ProjectProgress] 진행 상황 단계 삭제: id={stage_id}, project_id={project_id}")
    return None


@router.put("/{project_id}/progress-stages/{stage_id}/progress", response_model=ProgressStageOut)
def set_progress_stage_progress(
    project_id: int,
    stage_id: int,
    payload: ProgressStageProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stage = (
        db.query(ProjectProgressStage)
        .filter(ProjectProgressStage.id == stage_id, ProjectProgressStage.project_id == project_id)
        .first()
    )
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="진행 상황 항목을 찾을 수 없습니다.")

    if payload.progress_percent < 0 or payload.progress_percent > 100 or payload.progress_percent % 10 != 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="진행율은 0~100% 사이 10 단위여야 합니다.")

    stage.progress_percent = payload.progress_percent
    stage.completed_on = date.today() if stage.progress_percent == 100 else None
    db.commit()
    db.refresh(stage)
    logger.debug(
        f"[ProjectProgress] 진행 상황 단계 진행율 변경: id={stage_id}, progress_percent={stage.progress_percent}"
    )
    return stage


@router.put("/{project_id}/progress-stages/{stage_id}/schedule", response_model=ProgressStageOut)
def set_progress_stage_schedule(
    project_id: int,
    stage_id: int,
    payload: ProgressStageScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stage = (
        db.query(ProjectProgressStage)
        .filter(ProjectProgressStage.id == stage_id, ProjectProgressStage.project_id == project_id)
        .first()
    )
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="진행 상황 항목을 찾을 수 없습니다.")

    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료일은 시작일보다 빠를 수 없습니다.")

    stage.start_date = payload.start_date
    stage.end_date = payload.end_date
    db.commit()
    db.refresh(stage)
    logger.debug(
        f"[ProjectProgress] 진행 상황 단계 일정 변경: id={stage_id}, start={stage.start_date}, end={stage.end_date}"
    )
    return stage


@router.get("/{project_id}/purchase-steps", response_model=list[PurchaseStepOut])
def list_purchase_steps(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    project = _get_project_or_404(db, project_id)
    steps = _ensure_purchase_steps(db, project)
    return [_purchase_step_out(s) for s in sorted(steps, key=lambda s: s.order_index)]


@router.put("/{project_id}/purchase-steps/{step_id}/rename", response_model=PurchaseStepOut)
def rename_purchase_step(
    project_id: int,
    step_id: int,
    payload: PurchaseStepRename,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    step = (
        db.query(ProjectPurchaseStep)
        .filter(ProjectPurchaseStep.id == step_id, ProjectPurchaseStep.project_id == project_id)
        .first()
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="구매 진행 단계를 찾을 수 없습니다.")

    name = payload.label.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이름을 입력해주세요.")

    step.custom_label = name
    db.commit()
    db.refresh(step)
    logger.debug(f"[ProjectProgress] 구매 진행 단계 이름 변경: id={step_id}, label={name}")
    return _purchase_step_out(step)


@router.put("/{project_id}/purchase-steps/{step_id}/toggle", response_model=PurchaseStepOut)
def toggle_purchase_step(
    project_id: int, step_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    step = (
        db.query(ProjectPurchaseStep)
        .filter(ProjectPurchaseStep.id == step_id, ProjectPurchaseStep.project_id == project_id)
        .first()
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="구매 진행 단계를 찾을 수 없습니다.")

    step.is_done = not step.is_done
    step.completed_on = date.today() if step.is_done else None
    db.commit()
    db.refresh(step)
    logger.debug(
        f"[ProjectProgress] 구매 진행 단계 토글: id={step_id}, step_key={step.step_key}, is_done={step.is_done}"
    )
    return _purchase_step_out(step)
