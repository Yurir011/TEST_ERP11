from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.notice import Notice
from app.models.user import User
from app.schemas.notice import NoticeCreate, NoticeOut, NoticeUpdate

router = APIRouter(prefix="/api/notices", tags=["notices"])
logger = get_logger("Notices")


def _to_out(notice: Notice) -> NoticeOut:
    return NoticeOut(
        id=notice.id,
        title=notice.title,
        content=notice.content,
        author_name=notice.author.name,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
    )


@router.get("", response_model=list[NoticeOut])
def list_notices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    logger.debug(f"[Notices] 목록 조회: user_id={current_user.id}")
    notices = (
        db.query(Notice).options(joinedload(Notice.author)).order_by(Notice.created_at.desc()).all()
    )
    return [_to_out(n) for n in notices]


@router.get("/{notice_id}", response_model=NoticeOut)
def get_notice(notice_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notice = db.query(Notice).options(joinedload(Notice.author)).filter(Notice.id == notice_id).first()
    if notice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공지사항을 찾을 수 없습니다.")
    return _to_out(notice)


@router.post("", response_model=NoticeOut, status_code=status.HTTP_201_CREATED)
def create_notice(payload: NoticeCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    logger.debug(f"[Notices] 생성 시도: title={payload.title}, author_id={current_user.id}")
    notice = Notice(title=payload.title, content=payload.content, author_id=current_user.id)
    db.add(notice)
    db.commit()
    db.refresh(notice)
    notice.author = current_user
    logger.debug(f"[Notices] 생성 완료: id={notice.id}")
    return _to_out(notice)


@router.put("/{notice_id}", response_model=NoticeOut)
def update_notice(
    notice_id: int,
    payload: NoticeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    notice = db.query(Notice).options(joinedload(Notice.author)).filter(Notice.id == notice_id).first()
    if notice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공지사항을 찾을 수 없습니다.")

    notice.title = payload.title
    notice.content = payload.content
    db.commit()
    db.refresh(notice)
    logger.debug(f"[Notices] 수정 완료: id={notice.id}, editor_id={current_user.id}")
    return _to_out(notice)


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notice(notice_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if notice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공지사항을 찾을 수 없습니다.")

    db.delete(notice)
    db.commit()
    logger.debug(f"[Notices] 삭제 완료: id={notice_id}, by={current_user.id}")
    return None
