from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectStatusUpdate

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
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(
    status_filter: ProjectStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, description="프로젝트명 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Project).options(joinedload(Project.client))
    if status_filter is not None:
        query = query.filter(Project.status == status_filter)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%"))
    projects = query.order_by(Project.created_at.desc()).all()
    return [_to_out(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).options(joinedload(Project.client)).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    return _to_out(project)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    client = db.query(Client).filter(Client.id == payload.client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    logger.debug(f"[Projects] 생성: name={payload.name}, client_id={payload.client_id}, by={current_user.id}")
    project = Project(name=payload.name, client_id=payload.client_id, memo=payload.memo, created_by=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    project.client = client
    return _to_out(project)


@router.put("/{project_id}/status", response_model=ProjectOut)
def update_project_status(
    project_id: int,
    payload: ProjectStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).options(joinedload(Project.client)).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")

    project.status = payload.status
    db.commit()
    db.refresh(project)
    logger.debug(f"[Projects] 상태 변경: id={project_id}, status={payload.status}, by={current_user.id}")
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
