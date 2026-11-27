import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.project import Project, ProjectStatus
from app.services.project_rounds import round_info as _round_info
from app.models.project_file import ProjectFile
from app.models.project_release import ProjectRelease, ProjectReleaseFile
from app.models.project_bom import ProjectBomLine
from app.models.project_gerber import ProjectGerber
from app.models.project_progress import ProjectProgressStage, ProjectPurchaseStep
from app.models.user import User
from app.routers.project_progress import _purchase_step_out
from app.schemas.project import (
    ProjectCreate,
    ProjectNameUpdate,
    ProjectOut,
    ProjectProgressOverviewOut,
    ProjectProgressUpdate,
    ProjectRoundLabelUpdate,
    ProjectScheduleUpdate,
    ProjectStatusUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
logger = get_logger("Projects")


def _outs(db: Session, projects: list[Project]) -> list[ProjectOut]:
    info = _round_info(db, projects)
    return [_to_out(p, info.get(p.id)) for p in projects]


def _to_out(project: Project, round_info: tuple[int, int] | None = None) -> ProjectOut:
    return ProjectOut(
        series_id=project.series_id,
        round_no=round_info[0] if round_info else None,
        round_total=round_info[1] if round_info else None,
        round_label=project.round_label,
        id=project.id,
        name=project.name,
        client_id=project.client_id,
        client_name=project.client.name,
        status=project.status,
        discard_reason=project.discard_reason,
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
    q: str | None = Query(default=None, description="프로젝트명/거래처명/메모/폐기 사유 검색어"),
    date_from: date | None = Query(default=None, description="이 날짜 이후까지 이어지는 프로젝트 (프로젝트 기간과 하루라도 겹치면 포함)"),
    date_to: date | None = Query(default=None, description="이 날짜 이전에 시작하는 프로젝트 (프로젝트 기간과 하루라도 겹치면 포함)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Project).options(joinedload(Project.client), joinedload(Project.creator))
    if status_filter is not None:
        query = query.filter(Project.status == status_filter)
    if q:
        like = f"%{q.strip()}%"
        query = query.outerjoin(Client, Project.client_id == Client.id).filter(
            or_(Project.name.ilike(like), Project.memo.ilike(like), Project.discard_reason.ilike(like), Client.name.ilike(like))
        )
    # 기간 검색: 프로젝트 일정(시작일~종료일)과 검색 기간이 하루라도 겹치면 포함한다.
    # 시작일만 있으면 그 날부터 끝없이 이어지는 것으로, 종료일만 있으면 처음부터 그 날까지인 것으로 보고, 일정이 전혀 없는 프로젝트는 제외한다.
    if date_from is not None or date_to is not None:
        query = query.filter(or_(Project.start_date.isnot(None), Project.end_date.isnot(None)))
        if date_to is not None:
            query = query.filter(or_(Project.start_date.is_(None), Project.start_date <= date_to))
        if date_from is not None:
            query = query.filter(or_(Project.end_date.is_(None), Project.end_date >= date_from))
        logger.debug(f"[Projects] 기간 검색: {date_from} ~ {date_to}")
    projects = query.order_by(Project.created_at.desc()).all()
    return _outs(db, projects)


@router.get("/progress-overview", response_model=list[ProjectProgressOverviewOut])
def progress_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """진행 중·견적 프로젝트를 마감 임박순(마감일 없는 것은 뒤)으로, 진행 단계·구매 단계와 함께 돌려준다."""
    projects = (
        db.query(Project)
        .options(joinedload(Project.client), selectinload(Project.progress_stages), selectinload(Project.purchase_steps))
        # 새 프로젝트는 견적 상태·진행률 0% 로 시작하므로, 견적도 함께 보여 줘야 등록 즉시 카드가 생긴다.
        .filter(Project.status.in_([ProjectStatus.estimate, ProjectStatus.in_progress]))
        .all()
    )
    # 같은 묶음(회차)의 프로젝트는 카드 하나로 합친다: 진행 중인 회차(여럿이면 앞 회차), 없으면 가장 최근 회차가 대표.
    # (탭 추가로 회차가 늘어도 첫 화면 카드는 늘지 않는다. 목록의 합치기와 같은 규칙)
    info = _round_info(db, projects)
    chosen: dict[int, Project] = {}
    for p in sorted(projects, key=lambda x: (info.get(x.id, (0, 0))[0], x.id)):
        if p.series_id is None or p.id not in info:
            continue
        cur = chosen.get(p.series_id)
        if cur is None:
            chosen[p.series_id] = p
        elif cur.status != ProjectStatus.in_progress:
            # 지금 대표가 진행 중이 아니면: 진행 중인 회차가 나오면 교체하고, 둘 다 아니면 더 최근 회차로 교체
            chosen[p.series_id] = p
    keep_ids = {c.id for c in chosen.values()}
    projects = [p for p in projects if p.series_id is None or p.id not in info or p.id in keep_ids]
    projects.sort(key=lambda p: (p.end_date is None, p.end_date or date.max, p.id))
    logger.debug(f"[Projects] 진행 현황 조회: 카드 {len(projects)}건 (회차 묶음 {len(chosen)}개 합침), by={current_user.id}")
    return [
        ProjectProgressOverviewOut(
            id=p.id,
            name=p.name,
            client_name=p.client.name,
            start_date=p.start_date,
            end_date=p.end_date,
            progress_percent=p.progress_percent,
            stages=p.progress_stages,
            purchase_steps=[_purchase_step_out(s) for s in p.purchase_steps],
            round_no=info[p.id][0] if p.id in info else None,
            round_total=info[p.id][1] if p.id in info else None,
            round_label=p.round_label,
        )
        for p in projects
    ]


@router.get("/{project_id}/rounds", response_model=list[ProjectOut])
def list_rounds(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """같은 묶음(회차)의 프로젝트를 시작일 순으로 돌려준다. 묶음이 없는 프로젝트는 자기 자신만."""
    project = _get_project_or_404(project_id, db)
    if project.series_id is None:
        return _outs(db, [project])
    members = (
        db.query(Project)
        .options(joinedload(Project.client), joinedload(Project.creator))
        .filter(Project.series_id == project.series_id)
        .all()
    )
    members.sort(key=lambda m: (m.start_date or m.created_at.date(), m.id))
    logger.debug(f"[Projects] 회차 조회: id={project_id}, series_id={project.series_id}, 구성원 {len(members)}건")
    return _outs(db, members)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _outs(db, [_get_project_or_404(project_id, db)])[0]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if payload.client_id is not None:
        client = db.query(Client).filter(Client.id == payload.client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")
    else:
        # 목록에 없는 거래처를 직접 입력한 경우: 같은 이름의 거래처가 있으면 그것을 쓰고, 없으면 이름만으로 새로 등록한다.
        # (상세 정보는 거래처관리에서 나중에 채운다.)
        client = db.query(Client).filter(func.lower(Client.name) == payload.client_name.lower()).first()
        if client is None:
            client = Client(name=payload.client_name, created_by=current_user.id)
            db.add(client)
            db.flush()
            logger.debug(f"[Projects] 직접 입력한 거래처 새로 등록: id={client.id}, name={client.name}, by={current_user.id}")

    logger.debug(f"[Projects] 생성: name={payload.name}, client_id={client.id}, by={current_user.id}")
    project = Project(
        name=payload.name,
        client_id=client.id,
        memo=payload.memo,
        start_date=payload.start_date,
        end_date=payload.end_date,
        created_by=current_user.id,
    )
    source: Project | None = None
    if payload.from_project_id is not None:
        source = db.query(Project).filter(Project.id == payload.from_project_id).first()
        if source is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="불러올 프로젝트를 찾을 수 없습니다.")
    db.add(project)
    db.flush()
    if source is not None:
        if payload.link_series:
            # 묶음 번호는 묶음 첫 프로젝트의 id. 원본이 단독이면 원본을 첫 회차로 삼아 함께 묶는다.
            if source.series_id is None:
                source.series_id = source.id
            project.series_id = source.series_id
        if payload.copy_stages:
            for st in source.progress_stages:
                if payload.copy_progress:
                    # 탭 추가: 누른 회차의 진행상황을 그대로 복사한다 (진행률·완료일·단계별 일정)
                    db.add(
                        ProjectProgressStage(
                            project_id=project.id,
                            name=st.name,
                            order_index=st.order_index,
                            progress_percent=st.progress_percent,
                            completed_on=st.completed_on,
                            start_date=st.start_date,
                            end_date=st.end_date,
                        )
                    )
                else:
                    db.add(ProjectProgressStage(project_id=project.id, name=st.name, order_index=st.order_index))
        if payload.copy_progress:
            for ps in source.purchase_steps:
                db.add(
                    ProjectPurchaseStep(
                        project_id=project.id,
                        step_key=ps.step_key,
                        order_index=ps.order_index,
                        is_done=ps.is_done,
                        completed_on=ps.completed_on,
                        custom_label=ps.custom_label,
                    )
                )
            if source.status != ProjectStatus.discarded:
                project.status = source.status  # 진행률이 같으니 상태도 같게 (진행 중이면 진행 중)
        if payload.copy_bom:
            for line in source.bom_lines:
                db.add(
                    ProjectBomLine(
                        project_id=project.id,
                        material_id=line.material_id,
                        item_name=line.item_name,
                        quantity=line.quantity,
                        note=line.note,
                        created_by=current_user.id,
                    )
                )
        logger.debug(
            f"[Projects] 기존 프로젝트에서 불러오기: new={project.id}, from={source.id}, series_id={project.series_id}, "
            f"stages={payload.copy_stages}, bom={payload.copy_bom}"
        )
    db.commit()
    db.refresh(project)
    project.client = client
    project.creator = current_user
    return _outs(db, [project])[0]


@router.put("/{project_id}/round-label", response_model=ProjectOut)
def update_round_label(
    project_id: int,
    payload: ProjectRoundLabelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """회차 탭에 보여 줄 이름을 바꾼다 (예: "1차 시제품"). 비우면 기본 "N회차" 로 보인다."""
    project = _get_project_or_404(project_id, db)
    project.round_label = payload.label
    db.commit()
    db.refresh(project)
    logger.debug(f"[Projects] 회차 이름 변경: id={project_id}, label={payload.label}, by={current_user.id}")
    return _outs(db, [project])[0]


@router.put("/{project_id}/name", response_model=ProjectOut)
def update_project_name(
    project_id: int,
    payload: ProjectNameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    old_name = project.name
    project.name = payload.name
    db.commit()
    db.refresh(project)
    # 견적서·품의서·구매 등은 프로젝트 이름을 저장하지 않고 그때그때 불러 쓰므로 따로 고칠 것이 없다.
    logger.debug(f"[Projects] 이름 변경: id={project_id}, '{old_name}' -> '{project.name}', by={current_user.id}")
    return _outs(db, [project])[0]


@router.put("/{project_id}/status", response_model=ProjectOut)
def update_project_status(
    project_id: int,
    payload: ProjectStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    project.status = payload.status
    # 폐기 사유는 폐기 상태일 때만 보관하고, 다른 상태로 되돌리면 지운다.
    project.discard_reason = ((payload.reason or "").strip() or None) if payload.status == ProjectStatus.discarded else None
    db.commit()
    db.refresh(project)
    logger.debug(f"[Projects] 상태 변경: id={project_id}, status={payload.status}, reason={project.discard_reason}, by={current_user.id}")
    return _outs(db, [project])[0]


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
    return _outs(db, [project])[0]


@router.put("/{project_id}/progress", response_model=ProjectOut)
def update_project_progress(
    project_id: int,
    payload: ProjectProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_project_or_404(project_id, db)
    project.progress_percent = payload.progress_percent
    # 종합 진행률이 기록(10% 이상)되면 견적 단계 프로젝트는 자동으로 "진행"으로 바꾼다. 이미 진행/완료인 프로젝트는 건드리지 않는다.
    if payload.progress_percent >= 10 and project.status == ProjectStatus.estimate:
        project.status = ProjectStatus.in_progress
        logger.debug(f"[Projects] 진행율 기록으로 상태 자동 변경: id={project_id}, 견적 -> 진행")
    db.commit()
    db.refresh(project)
    logger.debug(f"[Projects] 진행율 변경: id={project_id}, progress_percent={payload.progress_percent}, by={current_user.id}")
    return _outs(db, [project])[0]


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    # 폐기한 프로젝트, 또는 같은 묶음에 다른 회차가 남는 회차(탭)는 삭제할 수 있다. 단독 프로젝트는 먼저 폐기해야 한다.
    other_rounds = (
        db.query(Project).filter(Project.series_id == project.series_id, Project.id != project.id).count()
        if project.series_id is not None
        else 0
    )
    if project.status != ProjectStatus.discarded and other_rounds == 0:
        logger.debug(f"[Projects] 삭제 거절(폐기 아님): id={project_id}, status={project.status}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="폐기한 프로젝트만 삭제할 수 있습니다.")
    stored = [g.file_path for g in db.query(ProjectGerber).filter(ProjectGerber.project_id == project_id)]
    stored += [f.file_path for f in db.query(ProjectFile).filter(ProjectFile.project_id == project_id)]
    stored += [f.file_path for f in db.query(ProjectReleaseFile).join(ProjectRelease).filter(ProjectRelease.project_id == project_id)]
    db.delete(project)
    db.commit()
    for path in stored:  # 올려 둔 거버·BOM 등 파일도 지운다 (실패해도 삭제는 끝난 상태)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            logger.warning(f"[Projects] 파일 삭제 실패: {path}")
    logger.debug(f"[Projects] 삭제: id={project_id}, files={len(stored)}, by={current_user.id}")
    return None
