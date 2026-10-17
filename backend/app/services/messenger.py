"""메신저 조회·변환 로직 (라우터가 쓰는 함수 모음).

권한의 기본 규칙: **대화방의 현재 참여자만** 그 대화방의 정보·메시지·첨부 파일에 접근할 수 있다. 참여자가 아니거나(관리자 포함)
나간 사람, 없는 대화방은 모두 같은 404 로 답해 대화방이 있는지조차 알 수 없게 한다.
"""
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.messenger import Conversation, ConversationMember, Message, MessageAttachment
from app.models.user import User
from app.schemas.messenger import ConversationOut, LastMessageOut, MemberOut, MessageOut

NOT_FOUND = "대화를 찾을 수 없습니다."
PREVIEW_LENGTH = 100


def direct_key(a: int, b: int) -> str:
    return f"{min(a, b)}:{max(a, b)}"


def not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)


def get_membership(db: Session, conversation_id: int, user_id: int) -> tuple[Conversation, ConversationMember]:
    """내가 현재 참여 중인 대화방과 내 참여 정보. 아니면 404."""
    row = (
        db.query(Conversation, ConversationMember)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .filter(Conversation.id == conversation_id, ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None))
        .first()
    )
    if row is None:
        raise not_found()
    return row[0], row[1]


def active_member_ids(db: Session, conversation_id: int) -> list[int]:
    rows = db.query(ConversationMember.user_id).filter(ConversationMember.conversation_id == conversation_id, ConversationMember.left_at.is_(None)).all()
    return [r[0] for r in rows]


def latest_message_id(db: Session, conversation_id: int) -> int | None:
    return db.query(func.max(Message.id)).filter(Message.conversation_id == conversation_id).scalar()


def now() -> datetime:
    return datetime.now(timezone.utc)


def message_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        sender_name=m.sender.name if m.sender else None,
        body=m.body,
        created_at=m.created_at,
        client_msg_id=m.client_msg_id,
        attachments=[{"id": a.id, "file_name": a.file_name, "size": a.size, "content_type": a.content_type} for a in m.attachments],
    )


def load_message(db: Session, message_id: int) -> Message:
    return (
        db.query(Message)
        .options(joinedload(Message.sender), selectinload(Message.attachments))
        .filter(Message.id == message_id)
        .one()
    )


def _preview(m: Message) -> str:
    if m.body:
        return m.body[:PREVIEW_LENGTH]
    if m.attachments:
        return f"[파일] {m.attachments[0].file_name}"[:PREVIEW_LENGTH]
    return ""


def unread_counts(db: Session, user_id: int, conversation_ids: list[int] | None = None) -> dict[int, int]:
    """대화방별 안 읽은 메시지 수 (다른 사람이 보낸 것 중 내가 읽은 번호보다 큰 것). 쿼리 1번."""
    q = (
        db.query(Message.conversation_id, func.count(Message.id))
        .join(
            ConversationMember,
            and_(ConversationMember.conversation_id == Message.conversation_id, ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None)),
        )
        .filter(Message.id > func.coalesce(ConversationMember.last_read_message_id, 0), Message.sender_id.is_distinct_from(user_id))
    )
    if conversation_ids is not None:
        q = q.filter(Message.conversation_id.in_(conversation_ids))
    return {cid: n for cid, n in q.group_by(Message.conversation_id).all()}


def conversation_summaries(db: Session, user_id: int, only_ids: list[int] | None = None) -> list[ConversationOut]:
    """내 대화방 목록(최근 대화 순). 대화방 수와 상관없이 쿼리는 고정된 몇 번이다 (N+1 없음)."""
    q = (
        db.query(Conversation, ConversationMember)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .filter(ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None))
    )
    if only_ids is not None:
        q = q.filter(Conversation.id.in_(only_ids))
    rows = q.order_by(func.coalesce(Conversation.last_message_at, Conversation.created_at).desc(), Conversation.id.desc()).all()
    if not rows:
        return []
    ids = [c.id for c, _ in rows]

    members: dict[int, list[MemberOut]] = {i: [] for i in ids}
    for cid, uid, name in (
        db.query(ConversationMember.conversation_id, User.id, User.name)
        .join(User, User.id == ConversationMember.user_id)
        .filter(ConversationMember.conversation_id.in_(ids), ConversationMember.left_at.is_(None))
        .order_by(User.name, User.id)
        .all()
    ):
        members[cid].append(MemberOut(id=uid, name=name))

    unread = unread_counts(db, user_id, ids)

    last_ids = [mid for _, mid in db.query(Message.conversation_id, func.max(Message.id)).filter(Message.conversation_id.in_(ids)).group_by(Message.conversation_id).all()]
    last_by_conv: dict[int, Message] = {}
    if last_ids:
        for m in db.query(Message).options(joinedload(Message.sender), selectinload(Message.attachments)).filter(Message.id.in_(last_ids)).all():
            last_by_conv[m.conversation_id] = m

    out: list[ConversationOut] = []
    for conv, me in rows:
        if conv.kind == "direct":
            others = [m.name for m in members[conv.id] if m.id != user_id]
            title = others[0] if others else "(알 수 없음)"
        else:
            title = conv.title or "그룹 대화"
        last = last_by_conv.get(conv.id)
        out.append(
            ConversationOut(
                id=conv.id,
                kind=conv.kind,  # type: ignore[arg-type]
                title=title,
                members=members[conv.id],
                last_message=(
                    LastMessageOut(
                        id=last.id,
                        sender_id=last.sender_id,
                        sender_name=last.sender.name if last.sender else None,
                        preview=_preview(last),
                        has_attachment=bool(last.attachments),
                        created_at=last.created_at,
                    )
                    if last
                    else None
                ),
                unread_count=unread.get(conv.id, 0),
                muted=me.muted,
                created_at=conv.created_at,
                last_message_at=conv.last_message_at,
            )
        )
    return out


def total_unread(db: Session, user_id: int) -> int:
    return sum(unread_counts(db, user_id).values())
