"""프로젝트 BOM·P&P·KiCad·STEP 파일의 버전 목록·등록·받기·삭제. 올릴 때마다 Rev A, B ... 로 쌓인다."""
import io
import os
import uuid
import zipfile
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_file import ProjectFile
from app.models.user import User
from app.schemas.project_file import ProjectFileOut

router = APIRouter(prefix="/api/projects", tags=["project-files"])
logger = get_logger("ProjectFile")

Kind = Literal["bom", "pnp", "kicad", "step"]
MAX_TOTAL_BYTES = 100 * 1024 * 1024
MAX_FILES = 200


def _ensure_project(db: Session, project_id: int) -> None:
    if db.query(Project.id).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")


def _revision_name(index: int) -> str:
    return f"Rev {chr(ord('A') + index)}" if index < 26 else f"Rev {index + 1}"


def _safe_name(name: str) -> str:
    return os.path.basename((name or "").replace("\\", "/")).strip() or "file"


def _list(db: Session, project_id: int, kind: str) -> list[ProjectFileOut]:
    rows = (
        db.query(ProjectFile)
        .options(selectinload(ProjectFile.uploader))
        .filter(ProjectFile.project_id == project_id, ProjectFile.kind == kind)
        .order_by(ProjectFile.id.desc())
        .all()
    )
    latest = rows[0].id if rows else 0
    return [
        ProjectFileOut(
            id=f.id,
            project_id=f.project_id,
            kind=f.kind,
            revision=f.revision,
            filename=f.filename,
            file_size=f.file_size,
            note=f.note,
            uploaded_by=f.uploader.name if f.uploader else None,
            created_at=f.created_at,
            is_latest=f.id == latest,
        )
        for f in rows
    ]


@router.get("/{project_id}/files/{kind}", response_model=list[ProjectFileOut])
def list_files(project_id: int, kind: Kind, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_project(db, project_id)
    rows = _list(db, project_id, kind)
    logger.debug(f"[ProjectFile] 목록: project_id={project_id}, kind={kind}, count={len(rows)}, by={current_user.id}")
    return rows


@router.post("/{project_id}/files/{kind}", response_model=list[ProjectFileOut], status_code=status.HTTP_201_CREATED)
def upload_file(
    project_id: int,
    kind: Kind,
    files: list[UploadFile] = File(...),
    note: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """파일 하나는 그대로, 여러 개는 zip 한 벌로 묶어 새 버전으로 쌓는다."""
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
        uploads.append((_safe_name(f.filename or "file"), data))
    logger.debug(f"[ProjectFile] 등록 시도: project_id={project_id}, kind={kind}, files={len(uploads)}, bytes={total}, by={current_user.id}")

    count = db.query(ProjectFile).filter(ProjectFile.project_id == project_id, ProjectFile.kind == kind).count()
    revision = _revision_name(count)
    if len(uploads) == 1:
        label, content = uploads[0]
    else:
        buf = io.BytesIO()
        seen: set[str] = set()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, data in uploads:
                if name in seen:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"같은 이름의 파일이 두 개 있습니다: {name}")
                seen.add(name)
                zf.writestr(name, data)
        label, content = f"{kind}_{revision.replace(' ', '_')}.zip", buf.getvalue()

    os.makedirs(settings.project_files_dir, exist_ok=True)
    stored = os.path.join(settings.project_files_dir, f"{project_id}_{kind}_{uuid.uuid4().hex}")
    with open(stored, "wb") as out:
        out.write(content)
    note_clean = (note or "").strip() or None
    db.add(
        ProjectFile(
            project_id=project_id,
            kind=kind,
            revision=revision,
            filename=label[:255],
            file_path=stored,
            file_size=len(content),
            note=note_clean[:500] if note_clean else None,
            created_by=current_user.id,
        )
    )
    db.commit()
    logger.debug(f"[ProjectFile] 등록 완료: project_id={project_id}, kind={kind}, revision={revision}")
    return _list(db, project_id, kind)


def _get_or_404(db: Session, project_id: int, kind: str, file_id: int) -> ProjectFile:
    f = db.query(ProjectFile).filter(ProjectFile.id == file_id, ProjectFile.project_id == project_id, ProjectFile.kind == kind).first()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일을 찾을 수 없습니다.")
    return f


@router.get("/{project_id}/files/{kind}/{file_id}/file")
def download_file(project_id: int, kind: Kind, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = _get_or_404(db, project_id, kind, file_id)
    if not os.path.isfile(f.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 파일을 찾을 수 없습니다.")
    logger.debug(f"[ProjectFile] 받기: project_id={project_id}, kind={kind}, id={file_id}, by={current_user.id}")
    return FileResponse(f.file_path, media_type="application/octet-stream", filename=f.filename)


@router.delete("/{project_id}/files/{kind}/{file_id}", response_model=list[ProjectFileOut])
def delete_file(project_id: int, kind: Kind, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = _get_or_404(db, project_id, kind, file_id)
    path = f.file_path
    db.delete(f)
    db.commit()
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        logger.warning(f"[ProjectFile] 파일 삭제 실패(기록은 지움): {path}")
    logger.debug(f"[ProjectFile] 삭제: project_id={project_id}, kind={kind}, id={file_id}, by={current_user.id}")
    return _list(db, project_id, kind)
