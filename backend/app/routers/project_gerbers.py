"""프로젝트 거버(PCB 제작용 레이어 파일 묶음) 등록·목록·받기·삭제. 그리는 일은 화면(브라우저)이 zip 을 받아 직접 한다.
권한은 우선 로그인한 모든 계정이 쓸 수 있고, 나중에 발주 연결·권한을 정한다."""
import io
import os
import uuid
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_gerber import ProjectGerber
from app.models.user import User
from app.schemas.project_gerber import GerberOut

router = APIRouter(prefix="/api/projects", tags=["project-gerbers"])
logger = get_logger("ProjectGerber")

MAX_TOTAL_BYTES = 40 * 1024 * 1024  # 한 번에 올리는 파일 전체 크기
MAX_FILES = 200
MAX_UNZIPPED_BYTES = 200 * 1024 * 1024  # zip 을 풀었을 때 크기 (압축 폭탄 방지)


def _ensure_project(db: Session, project_id: int) -> Project:
    p = db.query(Project).filter(Project.id == project_id).first()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    return p


def _revision_name(index: int) -> str:
    """0 → Rev A, 25 → Rev Z, 26 → Rev 27 ..."""
    return f"Rev {chr(ord('A') + index)}" if index < 26 else f"Rev {index + 1}"


def _out(g: ProjectGerber, latest_id: int) -> GerberOut:
    return GerberOut(
        id=g.id,
        project_id=g.project_id,
        revision=g.revision,
        filename=g.filename,
        file_size=g.file_size,
        layer_names=list(g.layer_names or []),
        note=g.note,
        uploaded_by=g.uploader.name if g.uploader else None,
        created_at=g.created_at,
        is_latest=g.id == latest_id,
    )


def _list(db: Session, project_id: int) -> list[GerberOut]:
    rows = db.query(ProjectGerber).options(selectinload(ProjectGerber.uploader)).filter(ProjectGerber.project_id == project_id).order_by(ProjectGerber.id.desc()).all()
    latest = rows[0].id if rows else 0
    return [_out(g, latest) for g in rows]


def _safe_name(name: str) -> str:
    base = os.path.basename((name or "").replace("\\", "/")).strip()
    return base or "file"


def _build_zip(uploads: list[tuple[str, bytes]]) -> tuple[bytes, list[str]]:
    """올린 것을 zip 한 벌로 만든다. zip 하나만 올렸으면 그대로(검사만), 여러 파일이면 하나로 묶는다."""
    if len(uploads) == 1 and uploads[0][1][:4] == b"PK\x03\x04":
        data = uploads[0][1]
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                infos = [i for i in zf.infolist() if not i.is_dir() and not i.filename.startswith("__MACOSX/")]
                if sum(i.file_size for i in infos) > MAX_UNZIPPED_BYTES:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="zip 을 풀었을 때 크기가 너무 큽니다.")
                names = sorted({_safe_name(i.filename) for i in infos})
        except zipfile.BadZipFile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="zip 파일이 손상되었거나 올바르지 않습니다.")
        if not names:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="zip 안에 파일이 없습니다.")
        return data, names
    buf = io.BytesIO()
    names: list[str] = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in uploads:
            safe = _safe_name(name)
            if safe in names:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"같은 이름의 파일이 두 개 있습니다: {safe}")
            zf.writestr(safe, content)
            names.append(safe)
    return buf.getvalue(), sorted(names)


@router.get("/{project_id}/gerbers", response_model=list[GerberOut])
def list_gerbers(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_project(db, project_id)
    rows = _list(db, project_id)
    logger.debug(f"[ProjectGerber] 목록: project_id={project_id}, count={len(rows)}, by={current_user.id}")
    return rows


@router.post("/{project_id}/gerbers", response_model=list[GerberOut], status_code=status.HTTP_201_CREATED)
def upload_gerber(
    project_id: int,
    files: list[UploadFile] = File(...),
    note: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거버 zip 하나, 또는 거버 파일 여러 개를 올린다. 올릴 때마다 새 버전(Rev A, B ...)으로 쌓인다."""
    _ensure_project(db, project_id)
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"파일은 1~{MAX_FILES}개까지 올릴 수 있습니다.")
    uploads: list[tuple[str, bytes]] = []
    total = 0
    for f in files:
        data = f.file.read(MAX_TOTAL_BYTES - total + 1)
        total += len(data)
        if total > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"파일 크기가 너무 큽니다. (전체 {MAX_TOTAL_BYTES // 1024 // 1024}MB 이하)")
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"빈 파일입니다: {_safe_name(f.filename or '')}")
        uploads.append((f.filename or "file", data))
    logger.debug(f"[ProjectGerber] 등록 시도: project_id={project_id}, files={len(uploads)}, bytes={total}, by={current_user.id}")
    zip_bytes, names = _build_zip(uploads)

    count = db.query(ProjectGerber).filter(ProjectGerber.project_id == project_id).count()
    revision = _revision_name(count)
    os.makedirs(settings.project_gerbers_dir, exist_ok=True)
    stored = os.path.join(settings.project_gerbers_dir, f"{project_id}_{uuid.uuid4().hex}.zip")
    with open(stored, "wb") as out:
        out.write(zip_bytes)
    label = _safe_name(uploads[0][0]) if len(uploads) == 1 else f"gerber_{revision.replace(' ', '_')}.zip"
    note_clean = (note or "").strip() or None
    g = ProjectGerber(
        project_id=project_id,
        revision=revision,
        filename=label if label.lower().endswith(".zip") else label + ".zip",
        file_path=stored,
        file_size=len(zip_bytes),
        layer_names=names,
        note=note_clean[:500] if note_clean else None,
        created_by=current_user.id,
    )
    db.add(g)
    db.commit()
    logger.debug(f"[ProjectGerber] 등록 완료: project_id={project_id}, id={g.id}, revision={revision}, layers={len(names)}")
    return _list(db, project_id)


def _get_or_404(db: Session, project_id: int, gerber_id: int) -> ProjectGerber:
    g = db.query(ProjectGerber).filter(ProjectGerber.id == gerber_id, ProjectGerber.project_id == project_id).first()
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거버를 찾을 수 없습니다.")
    return g


@router.get("/{project_id}/gerbers/{gerber_id}/file")
def download_gerber(project_id: int, gerber_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    g = _get_or_404(db, project_id, gerber_id)
    if not os.path.isfile(g.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 거버 파일을 찾을 수 없습니다.")
    logger.debug(f"[ProjectGerber] 받기: project_id={project_id}, id={gerber_id}, by={current_user.id}")
    return FileResponse(g.file_path, media_type="application/zip", filename=g.filename)


@router.delete("/{project_id}/gerbers/{gerber_id}", response_model=list[GerberOut])
def delete_gerber(project_id: int, gerber_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    g = _get_or_404(db, project_id, gerber_id)
    path = g.file_path
    db.delete(g)
    db.commit()
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        logger.warning(f"[ProjectGerber] 파일 삭제 실패(기록은 지움): {path}")
    logger.debug(f"[ProjectGerber] 삭제: project_id={project_id}, id={gerber_id}, by={current_user.id}")
    return _list(db, project_id)
