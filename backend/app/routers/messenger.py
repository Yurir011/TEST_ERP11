"""사내 메신저 REST API. 실시간 알림은 routers/messenger_ws.py (WebSocket).

- 보내기·읽기·대화방 만들기는 모두 이 REST API 로 한다. 저장이 끝난 뒤에만 참여자에게 실시간 알림을 보낸다.
- 대화방 참여자만 접근할 수 있고, 대표(관리자)도 남의 대화는 볼 수 없다 (services/messenger.py 참고).
- 감사 로그에는 메시지 내용을 남기지 않는다. 대화방 만들기·참여자 변경만 남긴다. 디버그 로그에도 본문은 길이만 쓴다.
"""
import os
import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import settings
from app.core.audit import record_event
from app.core.deps import get_current_user
from app.core.realtime import hub
from app.database import get_db
from app.logging_config import get_logger
from app.models.messenger import Conversation, ConversationMember, Message, MessageAttachment
from app.models.presence import MessengerFavorite
from app.models.user import User
from app.schemas.messenger import (
    MAX_BODY_LENGTH,
    MAX_GROUP_MEMBERS,
    ConversationCreate,
    ConversationOut,
    DirectoryUserOut,
    FavoriteOut,
    MembersAdd,
    MessageCreate,
    MessageOut,
    MessagePage,
    MessengerUserOut,
    MuteIn,
    ReadIn,
    ReadOut,
    StatusIn,
    StatusOut,
    UnreadTotalOut,
)
from app.services import messenger as svc
from app.services import presence
from app.services.upload_check import ATTACHMENT_TYPES, EXTENSIONS, read_upload

router = APIRouter(prefix="/api/messenger", tags=["messenger"])
logger = get_logger("Messenger")

MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 100
CATCH_UP_LIMIT = 200  # 다시 연결했을 때 한 번에 받아 가는 최대 개수
INLINE_TYPES = ("image/", "application/pdf")  # 화면에서 바로 보여 줘도 안전한 형식 (내용 검사를 통과한 것만 저장된다)


# ── 알림(실시간) ──────────────────────────────────────────────────

def _notify_message(db: Session, message_id: int, conversation_id: int) -> None:
    m = svc.load_message(db, message_id)
    hub.publish(svc.active_member_ids(db, conversation_id), {"type": "message.created", "message": svc.message_out(m).model_dump(mode="json")})


def _notify_conversation_changed(user_ids: list[int], conversation_id: int) -> None:
    hub.publish(user_ids, {"type": "conversation.updated", "conversation_id": conversation_id})


# ── 직원·대화방 목록 ───────────────────────────────────────────────

@router.get("/users", response_model=list[MessengerUserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """대화 상대로 고를 수 있는 직원(활성 계정, 나 제외)."""
    return db.query(User).filter(User.is_active.is_(True), User.id != current_user.id).order_by(User.name, User.id).all()


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return svc.conversation_summaries(db, current_user.id)


@router.get("/unread-count", response_model=UnreadTotalOut)
def get_unread_total(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return UnreadTotalOut(unread_count=svc.total_unread(db, current_user.id))


def _summary_one(db: Session, user_id: int, conversation_id: int) -> ConversationOut:
    (summary,) = svc.conversation_summaries(db, user_id, [conversation_id])
    return summary


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    svc.get_membership(db, conversation_id, current_user.id)
    return _summary_one(db, current_user.id, conversation_id)


# ── 대화방 만들기·참여자 ───────────────────────────────────────────

def _active_users_by_id(db: Session, ids: set[int]) -> dict[int, User]:
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids), User.is_active.is_(True)).all()}


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    others = set(payload.member_ids) - {current_user.id}
    users = _active_users_by_id(db, others)
    if len(users) != len(others):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="대화 상대를 찾을 수 없거나 사용할 수 없는 계정입니다.")

    if payload.kind == "direct":
        if len(others) != 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="1:1 대화는 상대 한 명을 골라야 합니다.")
        (other,) = users.values()
        key = svc.direct_key(current_user.id, other.id)
        existing = db.query(Conversation).filter(Conversation.direct_key == key).first()
        if existing is None:
            try:
                with db.begin_nested():
                    conv = Conversation(kind="direct", direct_key=key, created_by=current_user.id)
                    db.add(conv)
                    db.flush()
                    db.add_all([ConversationMember(conversation_id=conv.id, user_id=current_user.id), ConversationMember(conversation_id=conv.id, user_id=other.id)])
                    db.flush()
            except IntegrityError:  # 동시에 같은 대화방을 만든 경우: 먼저 만들어진 것을 쓴다
                existing = db.query(Conversation).filter(Conversation.direct_key == key).one()
            else:
                record_event(db, "conversation_created", "conversation", conv.id, f"1:1 대화 시작: {current_user.name} ↔ {other.name}")
                db.commit()
                logger.info(f"[Messenger] 1:1 대화 생성: conversation_id={conv.id}, by={current_user.id}")
                _notify_conversation_changed([current_user.id, other.id], conv.id)
                return _summary_one(db, current_user.id, conv.id)
        # 이미 있는 대화방을 돌려준다 (나간 적이 없는 1:1 이므로 참여 상태 그대로)
        response.status_code = status.HTTP_200_OK
        svc.get_membership(db, existing.id, current_user.id)
        return _summary_one(db, current_user.id, existing.id)

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="그룹 대화 이름을 입력하세요.")
    if len(others) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="그룹 대화는 나를 빼고 2명 이상을 골라야 합니다. 한 명과는 1:1 대화를 쓰세요.")
    if len(others) + 1 > MAX_GROUP_MEMBERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"그룹 대화는 최대 {MAX_GROUP_MEMBERS}명까지입니다.")
    conv = Conversation(kind="group", title=title, created_by=current_user.id)
    db.add(conv)
    db.flush()
    member_ids = [current_user.id, *sorted(others)]
    db.add_all([ConversationMember(conversation_id=conv.id, user_id=uid) for uid in member_ids])
    names = ", ".join([current_user.name, *(users[i].name for i in sorted(others))])
    record_event(db, "conversation_created", "conversation", conv.id, f"그룹 대화 만들기: '{title}' ({len(member_ids)}명: {names})")
    db.commit()
    logger.info(f"[Messenger] 그룹 대화 생성: conversation_id={conv.id}, 참여자 {len(member_ids)}명, by={current_user.id}")
    _notify_conversation_changed(member_ids, conv.id)
    return _summary_one(db, current_user.id, conv.id)


@router.post("/conversations/{conversation_id}/members", response_model=ConversationOut)
def add_members(conversation_id: int, payload: MembersAdd, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, _ = svc.get_membership(db, conversation_id, current_user.id)
    if conv.kind != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="1:1 대화에는 참여자를 추가할 수 없습니다.")
    wanted = set(payload.user_ids)
    users = _active_users_by_id(db, wanted)
    if len(users) != len(wanted):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="추가할 직원을 찾을 수 없거나 사용할 수 없는 계정입니다.")

    current = {m.user_id: m for m in db.query(ConversationMember).filter(ConversationMember.conversation_id == conv.id).all()}
    active_count = sum(1 for m in current.values() if m.left_at is None)
    to_add = [uid for uid in sorted(wanted) if uid not in current or current[uid].left_at is not None]
    if not to_add:
        return _summary_one(db, current_user.id, conv.id)
    if active_count + len(to_add) > MAX_GROUP_MEMBERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"그룹 대화는 최대 {MAX_GROUP_MEMBERS}명까지입니다.")

    # 새로 들어온 사람에게 이전 메시지가 전부 "안 읽음"으로 쌓이지 않게, 지금까지의 메시지는 읽은 것으로 시작한다 (이전 내용은 볼 수 있다)
    latest = svc.latest_message_id(db, conv.id)
    for uid in to_add:
        if uid in current:
            m = current[uid]
            m.left_at, m.joined_at, m.last_read_message_id = None, svc.now(), latest
        else:
            db.add(ConversationMember(conversation_id=conv.id, user_id=uid, last_read_message_id=latest))
    record_event(db, "conversation_members_added", "conversation", conv.id, f"그룹 대화 '{conv.title}' 참여자 추가: {', '.join(users[u].name for u in to_add)}")
    db.commit()
    logger.info(f"[Messenger] 참여자 추가: conversation_id={conv.id}, {len(to_add)}명, by={current_user.id}")
    _notify_conversation_changed(svc.active_member_ids(db, conv.id), conv.id)
    return _summary_one(db, current_user.id, conv.id)


@router.delete("/conversations/{conversation_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_conversation(conversation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, me = svc.get_membership(db, conversation_id, current_user.id)
    if conv.kind != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="1:1 대화는 나갈 수 없습니다.")
    me.left_at = svc.now()
    record_event(db, "conversation_left", "conversation", conv.id, f"그룹 대화 '{conv.title}' 나가기: {current_user.name}")
    db.commit()
    logger.info(f"[Messenger] 대화방 나감: conversation_id={conv.id}, user_id={current_user.id}")
    _notify_conversation_changed([*svc.active_member_ids(db, conv.id), current_user.id], conv.id)


@router.put("/conversations/{conversation_id}/mute", response_model=ConversationOut)
def set_muted(conversation_id: int, payload: MuteIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _, me = svc.get_membership(db, conversation_id, current_user.id)
    me.muted = payload.muted
    db.commit()
    return _summary_one(db, current_user.id, conversation_id)


# ── 메시지 ────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
def list_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, ge=1, description="이 번호보다 이전 메시지 (위로 스크롤)"),
    after_id: int | None = Query(default=None, ge=0, description="이 번호보다 이후 메시지 (다시 연결했을 때 놓친 것)"),
    limit: int = Query(default=PAGE_SIZE_DEFAULT, ge=1, le=PAGE_SIZE_MAX),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc.get_membership(db, conversation_id, current_user.id)
    if before_id is not None and after_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="before_id 와 after_id 는 함께 쓸 수 없습니다.")
    base = db.query(Message).options(joinedload(Message.sender), selectinload(Message.attachments)).filter(Message.conversation_id == conversation_id)

    if after_id is not None:
        rows = base.filter(Message.id > after_id).order_by(Message.id).limit(CATCH_UP_LIMIT + 1).all()
        has_more = len(rows) > CATCH_UP_LIMIT
        return MessagePage(messages=[svc.message_out(m) for m in rows[:CATCH_UP_LIMIT]], has_more=has_more)

    if before_id is not None:
        base = base.filter(Message.id < before_id)
    rows = base.order_by(Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    page = list(reversed(rows[:limit]))
    logger.debug(f"[Messenger] 메시지 조회: conversation_id={conversation_id}, 반환 {len(page)}개, has_more={has_more}")
    return MessagePage(messages=[svc.message_out(m) for m in page], has_more=has_more)


def _existing_by_client_id(db: Session, conversation_id: int, sender_id: int, client_msg_id: str | None) -> Message | None:
    if not client_msg_id:
        return None
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.sender_id == sender_id, Message.client_msg_id == client_msg_id)
        .first()
    )


def _save_message(db: Session, conv: Conversation, me: ConversationMember, user: User, body: str, client_msg_id: str | None) -> tuple[Message, bool]:
    """메시지를 저장한다. 같은 client_msg_id 가 이미 있으면 그것을 돌려준다 (두 번째 값: 새로 저장했는가)."""
    existing = _existing_by_client_id(db, conv.id, user.id, client_msg_id)
    if existing is not None:
        return existing, False
    m = Message(conversation_id=conv.id, sender_id=user.id, body=body, client_msg_id=client_msg_id)
    try:
        with db.begin_nested():
            db.add(m)
            db.flush()
    except IntegrityError:  # 같은 client_msg_id 로 동시에 두 번 들어온 경우
        existing = _existing_by_client_id(db, conv.id, user.id, client_msg_id)
        if existing is None:
            raise
        return existing, False
    conv.last_message_at = svc.now()
    me.last_read_message_id = m.id  # 내가 보낸 메시지는 읽은 것
    return m, True


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(
    conversation_id: int,
    payload: MessageCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv, me = svc.get_membership(db, conversation_id, current_user.id)
    m, created = _save_message(db, conv, me, current_user, payload.body, payload.client_msg_id)
    if not created:
        response.status_code = status.HTTP_200_OK
        return svc.message_out(svc.load_message(db, m.id))
    db.commit()
    logger.debug(f"[Messenger] 메시지 저장: conversation_id={conv.id}, message_id={m.id}, 길이={len(payload.body)}, by={current_user.id}")
    _notify_message(db, m.id, conv.id)
    return svc.message_out(svc.load_message(db, m.id))


_UNSAFE_NAME = re.compile(r"[\x00-\x1f\x7f]")


def _clean_filename(raw: str | None) -> str:
    """사용자가 올린 파일 이름에서 폴더 경로와 제어 문자를 없앤다 (표시·다운로드 이름으로만 쓰고, 저장 경로에는 쓰지 않는다)."""
    name = os.path.basename((raw or "").replace("\\", "/")).strip()
    name = _UNSAFE_NAME.sub("", name)
    return (name or "file")[:255]


@router.post("/conversations/{conversation_id}/attachments", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_attachment(
    conversation_id: int,
    response: Response,
    file: UploadFile = File(...),
    body: str = Form(default="", max_length=MAX_BODY_LENGTH),
    client_msg_id: str | None = Form(default=None, pattern=r"^[0-9A-Za-z-]{8,36}$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """파일 한 개와 (선택) 설명 글을 메시지로 보낸다."""
    conv, me = svc.get_membership(db, conversation_id, current_user.id)
    existing = _existing_by_client_id(db, conv.id, current_user.id, client_msg_id)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return svc.message_out(svc.load_message(db, existing.id))

    content = read_upload(file, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES)  # 파일 앞부분으로 실제 형식·크기를 확인한다
    directory = settings.messenger_attachments_dir
    os.makedirs(directory, exist_ok=True)
    stored_path = os.path.join(directory, f"{conv.id}_{uuid.uuid4().hex}.{EXTENSIONS[file.content_type]}")  # 확장자는 확인된 형식에서 정한다
    with open(stored_path, "wb") as f:
        f.write(content)
    try:
        m, created = _save_message(db, conv, me, current_user, body.strip(), client_msg_id)
        if created:
            db.add(MessageAttachment(message_id=m.id, file_name=_clean_filename(file.filename), stored_path=stored_path, size=len(content), content_type=file.content_type))
        db.commit()
    except Exception:
        db.rollback()
        os.remove(stored_path)
        raise
    if not created:  # 동시에 같은 요청이 먼저 저장됨: 방금 쓴 파일은 필요 없다
        os.remove(stored_path)
        response.status_code = status.HTTP_200_OK
        return svc.message_out(svc.load_message(db, m.id))
    logger.debug(f"[Messenger] 첨부 메시지 저장: conversation_id={conv.id}, message_id={m.id}, {len(content)} bytes, by={current_user.id}")
    _notify_message(db, m.id, conv.id)
    return svc.message_out(svc.load_message(db, m.id))


@router.get("/attachments/{attachment_id}")
def download_attachment(attachment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    att = db.get(MessageAttachment, attachment_id)
    if att is None:
        raise svc.not_found()
    message = db.get(Message, att.message_id)
    if message is None:
        raise svc.not_found()
    svc.get_membership(db, message.conversation_id, current_user.id)  # 대화방 참여자만
    if not os.path.exists(att.stored_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일을 찾을 수 없습니다.")
    inline = att.content_type.startswith(INLINE_TYPES)
    return FileResponse(
        att.stored_path,
        media_type=att.content_type,
        filename=att.file_name,
        content_disposition_type="inline" if inline else "attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


# ── 읽음 ──────────────────────────────────────────────────────────

@router.put("/conversations/{conversation_id}/read", response_model=ReadOut)
def mark_read(conversation_id: int, payload: ReadIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv, me = svc.get_membership(db, conversation_id, current_user.id)
    target = db.query(Message.id).filter(Message.id == payload.message_id, Message.conversation_id == conv.id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이 대화방의 메시지가 아닙니다.")
    if me.last_read_message_id is None or payload.message_id > me.last_read_message_id:  # 뒤로 가지 않는다
        me.last_read_message_id = payload.message_id
        db.commit()
        hub.publish(
            svc.active_member_ids(db, conv.id),
            {"type": "conversation.read", "conversation_id": conv.id, "user_id": current_user.id, "message_id": me.last_read_message_id},
        )
    unread = svc.unread_counts(db, current_user.id, [conv.id]).get(conv.id, 0)
    return ReadOut(last_read_message_id=me.last_read_message_id, unread_count=unread)



# ── 전체 목록·상태·즐겨찾기 ────────────────────────────────────────

@router.get("/directory", response_model=list[DirectoryUserOut])
def get_directory(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """메신저 '전체 목록': 활성 직원(나 제외)의 현재 상태와 내가 즐겨찾기했는지. 직원 수와 상관없이 쿼리는 고정."""
    users = db.query(User).filter(User.is_active.is_(True), User.id != current_user.id).order_by(User.name, User.id).all()
    favorites = {f for (f,) in db.query(MessengerFavorite.favorite_user_id).filter(MessengerFavorite.user_id == current_user.id)}
    statuses = presence.statuses_for(db, [u.id for u in users], date.today())
    return [DirectoryUserOut(id=u.id, name=u.name, grade=u.grade, title=u.title, status=statuses[u.id], is_favorite=u.id in favorites) for u in users]


@router.get("/status", response_model=StatusOut)
def get_my_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return StatusOut(status=presence.statuses_for(db, [current_user.id], date.today())[current_user.id])


@router.put("/status", response_model=StatusOut)
def set_my_status(payload: StatusIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """내 상태를 바꾼다 (본인만). 그날 하루 유지되고 다음 날 출퇴근·연차 기록으로 돌아간다. 변경 이력에는 남기지 않는다."""
    presence.set_status(db, current_user.id, payload.status, date.today())
    db.commit()
    logger.debug(f"[Messenger] 내 상태 변경: user_id={current_user.id}, status={payload.status}")
    presence.announce(current_user.id, payload.status)
    return StatusOut(status=payload.status)


def _favorite_target(db: Session, me: User, user_id: int) -> User:
    if user_id == me.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="나 자신은 즐겨찾기할 수 없습니다.")
    target = db.get(User, user_id)
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="직원을 찾을 수 없습니다.")
    return target


@router.put("/favorites/{user_id}", response_model=FavoriteOut)
def add_favorite(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _favorite_target(db, current_user, user_id)
    if db.get(MessengerFavorite, (current_user.id, user_id)) is None:
        db.add(MessengerFavorite(user_id=current_user.id, favorite_user_id=user_id))
        db.commit()
        hub.publish([current_user.id], {"type": "favorites.updated"})  # 내 다른 창도 갱신
    return FavoriteOut(user_id=user_id, is_favorite=True)


@router.delete("/favorites/{user_id}", response_model=FavoriteOut)
def remove_favorite(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.get(MessengerFavorite, (current_user.id, user_id))
    if row is not None:
        db.delete(row)
        db.commit()
        hub.publish([current_user.id], {"type": "favorites.updated"})
    return FavoriteOut(user_id=user_id, is_favorite=False)
