"""프로젝트 파일 버전(V.x.xx.xxx): 버전 등록·수정·삭제, 항목(BOM·Gerber·Pick Place·KiCad·STEP·Firmware·GUI)별 파일 올리기·이름 변경·받기·삭제."""
import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_release import GROUPED_CATEGORIES, RELEASE_CATEGORIES, RELEASE_GROUPS, ProjectRelease, ProjectReleaseFile
from app.models.user import User
from app.schemas.project_release import ReleaseFileOut, ReleaseFileRename, ReleaseIn, ReleaseOut

router = APIRouter(prefix="/api/projects", tags=["project-releases"])
logger = get_logger("ProjectRelease")

MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_FILES_PER_UPLOAD = 50


def _ensure_project(db: Session, project_id: int) -> None:
    if db.query(Project.id).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")


def _release_or_404(db: Session, project_id: int, release_id: int) -> ProjectRelease:
    r = db.query(ProjectRelease).filter(ProjectRelease.id == release_id, ProjectRelease.project_id == project_id).first()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일 버전을 찾을 수 없습니다.")
    return r


def _out(r: ProjectRelease) -> ReleaseOut:
    return ReleaseOut(
        id=r.id,
        project_id=r.project_id,
        version=r.version,
        release_date=r.release_date,
        files=[ReleaseFileOut(id=f.id, category=f.category, group=f.group, filename=f.filename, file_size=f.file_size, created_at=f.created_at) for f in r.files],
    )


def _safe_name(name: str) -> str:
    return os.path.basename((name or "").replace("\\", "/")).strip() or "file"


def _remove_paths(paths: list[str]) -> None:
    for path in paths:
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            logger.warning(f"[ProjectRelease] 파일 삭제 실패(기록은 지움): {path}")


@router.get("/{project_id}/releases", response_model=list[ReleaseOut])
def list_releases(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """최신순(날짜, 같으면 나중에 만든 순)."""
    _ensure_project(db, project_id)
    rows = (
        db.query(ProjectRelease)
        .options(selectinload(ProjectRelease.files))
        .filter(ProjectRelease.project_id == project_id)
        .order_by(ProjectRelease.release_date.desc(), ProjectRelease.id.desc())
        .all()
    )
    logger.debug(f"[ProjectRelease] 목록: project_id={project_id}, count={len(rows)}, by={current_user.id}")
    return [_out(r) for r in rows]


@router.post("/{project_id}/releases", response_model=ReleaseOut, status_code=status.HTTP_201_CREATED)
def create_release(project_id: int, payload: ReleaseIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_project(db, project_id)
    r = ProjectRelease(project_id=project_id, version=payload.version, release_date=payload.release_date or date.today(), created_by=current_user.id)
    db.add(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"이미 있는 파일 버전입니다: {payload.version}")
    logger.debug(f"[ProjectRelease] 버전 등록: project_id={project_id}, version={payload.version}, by={current_user.id}")
    return _out(r)


@router.put("/{project_id}/releases/{release_id}", response_model=ReleaseOut)
def update_release(project_id: int, release_id: int, payload: ReleaseIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = _release_or_404(db, project_id, release_id)
    r.version = payload.version
    if payload.release_date:
        r.release_date = payload.release_date
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"이미 있는 파일 버전입니다: {payload.version}")
    logger.debug(f"[ProjectRelease] 버전 수정: id={release_id}, version={payload.version}, by={current_user.id}")
    return _out(r)


@router.delete("/{project_id}/releases/{release_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_release(project_id: int, release_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = _release_or_404(db, project_id, release_id)
    paths = [f.file_path for f in r.files]
    db.delete(r)
    db.commit()
    _remove_paths(paths)
    logger.debug(f"[ProjectRelease] 버전 삭제: id={release_id}, files={len(paths)}, by={current_user.id}")


@router.post("/{project_id}/releases/{release_id}/files", response_model=ReleaseOut, status_code=status.HTTP_201_CREATED)
def upload_release_files(
    project_id: int,
    release_id: int,
    category: str = Form(...),
    group: str | None = Form(default=None),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """한 항목에 파일을 올린다 (여러 개 가능). Firmware·GUI 는 group 으로 bin / src 를 고른다."""
    r = _release_or_404(db, project_id, release_id)
    if category not in RELEASE_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="알 수 없는 항목입니다.")
    if category in GROUPED_CATEGORIES:
        if group not in RELEASE_GROUPS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="bin 또는 src 를 골라 주세요.")
    else:
        group = None
    if not files or len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"파일은 1~{MAX_FILES_PER_UPLOAD}개까지 올릴 수 있습니다.")
    saved: list[tuple[str, str, int]] = []
    os.makedirs(settings.project_files_dir, exist_ok=True)
    try:
        for f in files:
            data = f.file.read(MAX_FILE_BYTES + 1)
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"파일 크기가 너무 큽니다. ({MAX_FILE_BYTES // 1024 // 1024}MB 이하)")
            name = _safe_name(f.filename or "file")
            if not data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"빈 파일입니다: {name}")
            stored = os.path.join(settings.project_files_dir, f"{project_id}_rel{release_id}_{category}_{uuid.uuid4().hex}")
            with open(stored, "wb") as out:
                out.write(data)
            saved.append((name, stored, len(data)))
    except HTTPException:
        _remove_paths([s[1] for s in saved])
        raise
    for name, stored, size in saved:
        r.files.append(ProjectReleaseFile(category=category, group=group, filename=name[:255], file_path=stored, file_size=size, created_by=current_user.id))
    db.commit()
    logger.debug(f"[ProjectRelease] 파일 올림: release_id={release_id}, category={category}, group={group}, count={len(saved)}, by={current_user.id}")
    return _out(_release_or_404(db, project_id, release_id))


def _file_or_404(db: Session, project_id: int, release_id: int, file_id: int) -> ProjectReleaseFile:
    _release_or_404(db, project_id, release_id)
    f = db.query(ProjectReleaseFile).filter(ProjectReleaseFile.id == file_id, ProjectReleaseFile.release_id == release_id).first()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일을 찾을 수 없습니다.")
    return f


@router.put("/{project_id}/releases/{release_id}/files/{file_id}", response_model=ReleaseOut)
def rename_release_file(project_id: int, release_id: int, file_id: int, payload: ReleaseFileRename, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = _file_or_404(db, project_id, release_id, file_id)
    name = _safe_name(payload.filename)
    f.filename = name[:255]
    db.commit()
    logger.debug(f"[ProjectRelease] 파일 이름 변경: id={file_id}, name={name}, by={current_user.id}")
    return _out(_release_or_404(db, project_id, release_id))


@router.get("/{project_id}/releases/{release_id}/files/{file_id}/file")
def download_release_file(project_id: int, release_id: int, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = _file_or_404(db, project_id, release_id, file_id)
    if not os.path.isfile(f.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 파일을 찾을 수 없습니다.")
    logger.debug(f"[ProjectRelease] 받기: release_id={release_id}, id={file_id}, by={current_user.id}")
    return FileResponse(f.file_path, media_type="application/octet-stream", filename=f.filename)


@router.delete("/{project_id}/releases/{release_id}/files/{file_id}", response_model=ReleaseOut)
def delete_release_file(project_id: int, release_id: int, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = _file_or_404(db, project_id, release_id, file_id)
    path = f.file_path
    db.delete(f)
    db.commit()
    _remove_paths([path])
    logger.debug(f"[ProjectRelease] 파일 삭제: id={file_id}, by={current_user.id}")
    return _out(_release_or_404(db, project_id, release_id))
