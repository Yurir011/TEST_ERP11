from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectOut,
    ProjectProgressUpdate,
    ProjectScheduleUpdate,
    ProjectStatusUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
logger = get_logger("Projects")


def _to_out(project: Project) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        client_id=project.client_id,
        client_name=project.client.name,
        status=project.status,
        memo=project.memo,
        start_date=project.start_date,
        end_date=project.end_date,
        progress_percent=project.progress_percent,
        creator_name=project.creator.name,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _get_project_or_404(project_id: int, db: Session) -> Project:
    project = (
        db.query(Project)
        .options(joinedload(Project.client), joinedload(Project.creator))
        .filter(Project.id == project_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(
    status_filter: ProjectStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, description="프로젝트명 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Project).options(joinedload(Project.client), joinedload(Project.creator))
    if status_filter is not None:
        query = query.filter(Project.status == status_filter)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%"))
    projects = query.order_by(Project.created_at.desc()).all()
    return [_to_out(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _to_out(_get_project_or_404(project_id, db))


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    client = db.query(Client).filter(Client.id == payload.client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    logger.debug(f"[Projects] 생성: name={payload.name}, client_id={payload.client_id}, by={current_user.id}")
    project = Project(
        name=payload.name,
        client_id=payload.client_id,
        memo=payload.memo,
        start_date=payload.start_date,
        end_date=payload.end_date,
        created_by=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    project.client = client
    project.creator = current_user
    return _to_out(project)


@router.put("/{project_id}/status", response_model=ProjectOut)
def update_project_status(
    project_id: int,
    payload: ProjectStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    project.status = payload.status
    db.commit()
    db.refresh(project)
    logger.debug(f"[Projects] 상태 변경: id={project_id}, status={payload.status}, by={current_user.id}")
    return _to_out(project)


@router.put("/{project_id}/schedule", response_model=ProjectOut)
def update_project_schedule(
    project_id: int,
    payload: ProjectScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    project.start_date = payload.start_date
    project.end_date = payload.end_date
    db.commit()
    db.refresh(project)
    logger.debug(
        f"[Projects] 일정 변경: id={project_id}, start_date={payload.start_date}, end_date={payload.end_date}, "
        f"by={current_user.id}"
    )
    return _to_out(project)


@router.put("/{project_id}/progress", response_model=ProjectOut)
def update_project_progress(
    project_id: int,
    payload: ProjectProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    project.progress_percent = payload.progress_percent
    db.commit()
    db.refresh(project)
    logger.debug(f"[Projects] 진행율 변경: id={project_id}, progress_percent={payload.progress_percent}, by={current_user.id}")
    return _to_out(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    db.delete(project)
    db.commit()
    logger.debug(f"[Projects] 삭제: id={project_id}, by={current_user.id}")
    return None
