"""프로젝트 날짜별 메모 조회·추가·삭제."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.project import Project
from app.models.project_note import ProjectDateNote
from app.models.user import User, is_admin_role
from app.schemas.project_note import ProjectNoteCreate, ProjectNoteOut, ProjectNoteUpdate

router = APIRouter(prefix="/api/projects", tags=["project-notes"])
logger = get_logger("ProjectNotes")


def _out(note: ProjectDateNote, names: dict[int, str | None] | None = None) -> ProjectNoteOut:
    """names: 메모 id → 작성자 이름 (답글이 누구에게 단 것인지 보여 주려고 부모 이름을 찾는 데 쓴다)"""
    return ProjectNoteOut(
        id=note.id,
        parent_id=note.parent_id,
        reply_to_name=(names or {}).get(note.parent_id) if note.parent_id is not None else None,
        edited_at=note.edited_at,
        note_date=note.note_date,
        content=note.content,
        author_name=note.author.name if note.author else None,
        created_by=note.created_by,
        created_at=note.created_at,
    )


def _ensure_project(db: Session, project_id: int) -> None:
    if db.query(Project.id).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")


@router.get("/{project_id}/date-notes", response_model=list[ProjectNoteOut])
def list_date_notes(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_project(db, project_id)
    notes = (
        db.query(ProjectDateNote)
        .options(joinedload(ProjectDateNote.author))
        .filter(ProjectDateNote.project_id == project_id)
        .order_by(ProjectDateNote.note_date.desc(), ProjectDateNote.id.asc())
        .all()
    )
    logger.debug(f"[ProjectNotes] 날짜별 메모 조회: project_id={project_id}, count={len(notes)}, by={current_user.id}")
    names = {n.id: (n.author.name if n.author else None) for n in notes}
    return [_out(n, names) for n in notes]


@router.post("/{project_id}/date-notes", response_model=ProjectNoteOut, status_code=status.HTTP_201_CREATED)
def create_date_note(
    project_id: int,
    payload: ProjectNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(db, project_id)
    logger.debug(f"[ProjectNotes] 메모 추가 시도: project_id={project_id}, date={payload.note_date}, parent={payload.parent_id}, by={current_user.id}")
    note_date = payload.note_date
    if payload.parent_id is not None:
        parent = (
            db.query(ProjectDateNote)
            .filter(ProjectDateNote.id == payload.parent_id, ProjectDateNote.project_id == project_id)
            .first()
        )
        if parent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="답글을 남길 메모를 찾을 수 없습니다.")
        note_date = parent.note_date  # 답글은 원 메모와 같은 날짜에 붙는다 (답글에 단 답글도 같은 날짜)
    elif note_date is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="메모 날짜를 지정해주세요.")
    note = ProjectDateNote(
        project_id=project_id, note_date=note_date, content=payload.content, parent_id=payload.parent_id, created_by=current_user.id
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    logger.debug(f"[ProjectNotes] 메모 추가 완료: id={note.id}")
    parent_names = {payload.parent_id: parent.author.name if parent.author else None} if payload.parent_id is not None else None
    return _out(note, parent_names)


@router.put("/{project_id}/date-notes/{note_id}", response_model=ProjectNoteOut)
def update_date_note(
    project_id: int,
    note_id: int,
    payload: ProjectNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """메모·답글 내용 수정. 쓴 사람만 고칠 수 있고, 고치면 '수정됨'으로 표시된다."""
    note = (
        db.query(ProjectDateNote)
        .options(joinedload(ProjectDateNote.author))
        .filter(ProjectDateNote.id == note_id, ProjectDateNote.project_id == project_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="메모를 찾을 수 없습니다.")
    if note.created_by != current_user.id:
        logger.warning(f"[ProjectNotes] 수정 권한 없음: id={note_id}, by={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 수정할 수 있습니다.")
    if payload.content != note.content:
        note.content = payload.content
        note.edited_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(note)
    logger.debug(f"[ProjectNotes] 메모 수정: id={note_id}, by={current_user.id}")
    parent = db.get(ProjectDateNote, note.parent_id) if note.parent_id is not None else None
    names = {parent.id: parent.author.name if parent.author else None} if parent is not None else None
    return _out(note, names)


@router.delete("/{project_id}/date-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_date_note(
    project_id: int, note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    note = (
        db.query(ProjectDateNote)
        .filter(ProjectDateNote.id == note_id, ProjectDateNote.project_id == project_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="메모를 찾을 수 없습니다.")
    if note.created_by != current_user.id and not is_admin_role(current_user.role):
        logger.warning(f"[ProjectNotes] 삭제 권한 없음: id={note_id}, by={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자 또는 관리자만 삭제할 수 있습니다.")
    db.delete(note)
    db.commit()
    logger.debug(f"[ProjectNotes] 메모 삭제: id={note_id}, by={current_user.id}")
