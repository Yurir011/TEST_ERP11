from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import JobGrade, JobTitle

MAX_BODY_LENGTH = 4000
MAX_GROUP_MEMBERS = 50


class MessengerUserOut(BaseModel):
    """대화 상대로 고를 수 있는 직원 (연락처 등은 주지 않는다)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    grade: JobGrade
    title: JobTitle | None


class MemberOut(BaseModel):
    id: int
    name: str
    last_read_message_id: int | None = None  # 이 사람이 읽은 위치 ("읽음" 표시용)


class LastMessageOut(BaseModel):
    id: int
    sender_id: int | None
    sender_name: str | None
    preview: str
    has_attachment: bool
    created_at: datetime


class ConversationOut(BaseModel):
    id: int
    kind: Literal["direct", "group"]
    title: str  # 1:1 은 상대 이름, 그룹은 그룹 이름
    members: list[MemberOut]
    last_message: LastMessageOut | None
    unread_count: int
    muted: bool
    created_at: datetime
    last_message_at: datetime | None


class ConversationCreate(BaseModel):
    kind: Literal["direct", "group"]
    member_ids: list[int] = Field(min_length=1, max_length=MAX_GROUP_MEMBERS)
    title: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class MembersAdd(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=MAX_GROUP_MEMBERS)


class MessageCreate(BaseModel):
    body: str = Field(max_length=MAX_BODY_LENGTH)
    client_msg_id: str | None = Field(default=None, pattern=r"^[0-9A-Za-z-]{8,36}$")

    @field_validator("body")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("메시지 내용을 입력하세요.")
        return v


class AttachmentOut(BaseModel):
    id: int
    file_name: str
    size: int
    content_type: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None
    sender_name: str | None
    body: str
    created_at: datetime
    client_msg_id: str | None
    attachments: list[AttachmentOut]
    deleted_at: datetime | None = None  # 보낸 사람이 지운 메시지이면 그 시각 (내용·첨부는 비어 있다)


class MessagePage(BaseModel):
    messages: list[MessageOut]  # 오래된 것부터 (화면에 그대로 위에서 아래로)
    has_more: bool  # before_id 로 더 이전 메시지가 있는가


class ReadIn(BaseModel):
    message_id: int = Field(ge=1)


class ReadOut(BaseModel):
    last_read_message_id: int | None
    unread_count: int


class MuteIn(BaseModel):
    muted: bool


class UnreadTotalOut(BaseModel):
    unread_count: int


class DirectoryUserOut(BaseModel):
    """메신저 전체 목록의 직원 한 명: 현재 상태와 내가 즐겨찾기했는지."""

    id: int
    name: str
    grade: JobGrade
    title: JobTitle | None
    status: str
    is_favorite: bool


class StatusIn(BaseModel):
    status: Literal["working", "meeting", "meal", "outside", "trip", "leave", "off"]


class StatusOut(BaseModel):
    status: str


class FavoriteOut(BaseModel):
    user_id: int
    is_favorite: bool
