from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Conversation(Base):
    """대화방: 1:1(direct) 또는 그룹(group). 1:1 은 두 사람 사이에 하나만 있도록 direct_key("작은ID:큰ID")를 유일하게 둔다."""

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # direct / group
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 그룹만
    direct_key: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class ConversationMember(Base):
    """대화방 참여자. 나간 사람은 left_at 만 채워 두고 행은 남긴다(기록 보존, 다시 초대 가능)."""

    __tablename__ = "conversation_members"

    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 이 번호까지 읽었다. 이보다 큰 번호의 다른 사람 메시지가 "안 읽은 메시지"다.
    last_read_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    muted: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    user: Mapped["User"] = relationship()


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
        # 같은 사람이 같은 client_msg_id 로 두 번 보내도(네트워크 재시도) 한 번만 저장한다
        UniqueConstraint("conversation_id", "sender_id", "client_msg_id", name="uq_messages_client_msg"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(Text, default="")
    client_msg_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 보낸 사람이 지운 시각. 지우면 내용(body)과 첨부파일은 실제로 없애고 행만 남겨 대화창에 "삭제된 메시지입니다"로 보여 준다.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sender: Mapped["User | None"] = relationship()
    attachments: Mapped[list["MessageAttachment"]] = relationship(order_by="MessageAttachment.id", cascade="all, delete-orphan")


class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))  # 보낸 사람이 올린 이름 (표시·다운로드용)
    stored_path: Mapped[str] = mapped_column(String(300))  # 서버에 저장한 경로 (이름은 서버가 정한다)
    size: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(100))  # 파일 내용으로 확인된 형식
