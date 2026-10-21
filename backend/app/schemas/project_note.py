from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

MAX_NOTE_LENGTH = 2000


class ProjectNoteCreate(BaseModel):
    note_date: date | None = None  # 답글이면 비워 둔다(원 메모의 날짜를 따른다)
    parent_id: int | None = None  # 답글을 남길 대상 (원 메모 또는 다른 답글)
    content: str = Field(max_length=MAX_NOTE_LENGTH)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("메모 내용을 입력해주세요.")
        return value


class ProjectNoteUpdate(BaseModel):
    content: str = Field(max_length=MAX_NOTE_LENGTH)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("메모 내용을 입력해주세요.")
        return value


class ProjectNoteOut(BaseModel):
    id: int
    parent_id: int | None = None
    reply_to_name: str | None = None  # 답글을 단 대상(부모)의 작성자 이름
    edited_at: datetime | None = None
    note_date: date
    content: str
    author_name: str | None
    created_by: int | None
    created_at: datetime
