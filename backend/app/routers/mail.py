"""메일 연동 API. 메일 자체(받은 편지·비밀번호)는 직원 PC 의 앱에만 있고 서버는 받지 않는다. 서버가 아는 것은 두 가지뿐이다.

- 안 읽은 메일 수: 앱(로그인한 화면)이 알려 주면 서버 메모리에만 잠시 둔다 (웹 화면에 숫자만 보여 주기 위함). 본인 것만 읽고 쓴다.
- 문서 발송 이력: 직원이 문서(견적서 등)를 앱에서 메일로 보낸 직후 보고한 기록. 받는 사람·제목·누가·언제만 저장하고 본문·첨부는 저장하지 않는다.
  직원이 보고한 값이라 참고용이다 (증빙은 메일 서버의 보낸편지함).
"""
import re
import time
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.mail_log import MailLog
from app.models.project_document import ProjectDocument
from app.models.user import User

router = APIRouter(prefix="/api/mail", tags=["mail"])
logger = get_logger("Mail")

MAX_UNREAD = 99_999
UNREAD_TTL_SECONDS = 30 * 60  # 앱이 이 시간 넘게 알려 주지 않으면(앱 종료 등) 숫자를 보여 주지 않는다
MAX_RECIPIENTS = 50

# user_id -> (안 읽은 수, 보고 받은 시각). 서버를 다시 켜면 비어 있고 앱이 곧 다시 알려 준다.
_unread: dict[int, tuple[int, float]] = {}

_EMAIL = re.compile(r"^[^\s@<>,;\"]{1,64}@[^\s@<>,;\"]{1,255}$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")

DocType = Literal["project_document"]


class UnreadIn(BaseModel):
    unread: int = Field(ge=0, le=MAX_UNREAD)


class UnreadOut(BaseModel):
    """unread 가 null 이면 모른다 (앱이 꺼져 있거나 메일 계정이 없음)"""

    unread: int | None


class SentIn(BaseModel):
    doc_type: DocType
    doc_id: int = Field(gt=0)
    to: list[str] = Field(min_length=1, max_length=MAX_RECIPIENTS)
    subject: str = Field(max_length=255)


class MailLogOut(BaseModel):
    id: int
    created_at: datetime
    sender_name: str | None
    to_addresses: str
    subject: str


def _ensure_document(db: Session, doc_type: str, doc_id: int) -> None:
    """보고할 수 있는 문서인지 확인한다 (존재하지 않는 문서에 기록이 쌓이지 않게)."""
    if doc_type == "project_document" and db.get(ProjectDocument, doc_id) is not None:
        return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")


@router.put("/unread", status_code=status.HTTP_204_NO_CONTENT)
def put_unread(payload: UnreadIn, current_user: User = Depends(get_current_user)):
    _unread[current_user.id] = (payload.unread, time.monotonic())
    logger.debug(f"[Mail] 안 읽은 메일 수 보고: user_id={current_user.id}, unread={payload.unread}")


@router.get("/unread", response_model=UnreadOut)
def get_unread(current_user: User = Depends(get_current_user)):
    entry = _unread.get(current_user.id)
    if entry is None or time.monotonic() - entry[1] > UNREAD_TTL_SECONDS:
        return UnreadOut(unread=None)
    return UnreadOut(unread=entry[0])


@router.post("/sent", status_code=status.HTTP_201_CREATED)
def report_sent(payload: SentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_document(db, payload.doc_type, payload.doc_id)
    addresses = [a.strip() for a in payload.to]
    if not all(_EMAIL.match(a) for a in addresses):
        raise HTTPException(status_code=422, detail="받는 사람 주소가 올바르지 않습니다.")
    subject = _CONTROL.sub(" ", payload.subject).strip()
    log = MailLog(
        sender_user_id=current_user.id,
        doc_type=payload.doc_type,
        doc_id=payload.doc_id,
        to_addresses=", ".join(addresses)[:1000],
        subject=subject,
    )
    db.add(log)
    db.commit()
    logger.debug(f"[Mail] 문서 발송 이력 저장: {payload.doc_type}#{payload.doc_id}, by={current_user.id}, 받는 사람 {len(addresses)}명")
    return {"id": log.id}


@router.get("/logs", response_model=list[MailLogOut])
def list_logs(
    doc_type: DocType,
    doc_id: int = Query(gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_document(db, doc_type, doc_id)
    rows = (
        db.query(MailLog, User.name)
        .outerjoin(User, User.id == MailLog.sender_user_id)
        .filter(MailLog.doc_type == doc_type, MailLog.doc_id == doc_id)
        .order_by(MailLog.created_at.desc(), MailLog.id.desc())
        .limit(50)
        .all()
    )
    return [MailLogOut(id=m.id, created_at=m.created_at, sender_name=name, to_addresses=m.to_addresses, subject=m.subject) for m, name in rows]
