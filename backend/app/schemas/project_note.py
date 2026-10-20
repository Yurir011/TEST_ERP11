from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

MAX_NOTE_LENGTH = 2000


class ProjectNoteCreate(BaseModel):
    note_date: date
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
    note_date: date
    content: str
    author_name: str | None
    created_by: int | None
    created_at: datetime
