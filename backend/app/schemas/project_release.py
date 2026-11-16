from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class ReleaseIn(BaseModel):
    version: str = Field(min_length=1, max_length=30)
    release_date: date | None = None  # 비우면 오늘

    @field_validator("version")
    @classmethod
    def _v(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("파일 버전을 입력해 주세요.")
        return v


class ReleaseFileRename(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


class ReleaseFileOut(BaseModel):
    id: int
    category: str
    group: str | None
    filename: str
    file_size: int
    created_at: datetime


class ReleaseOut(BaseModel):
    id: int
    project_id: int
    version: str
    release_date: date
    files: list[ReleaseFileOut]
