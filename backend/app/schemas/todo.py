from datetime import date, datetime

import re

from pydantic import BaseModel, ConfigDict, field_validator


class TodoCreate(BaseModel):
    content: str


class TodoColorUpdate(BaseModel):
    color: str | None = None  # "#RRGGBB". None이면 기본 색으로 되돌린다.

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            raise ValueError("색은 #RRGGBB 형식이어야 합니다.")
        return v


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    is_done: bool
    color: str | None = None
    completed_on: date | None = None
    created_at: datetime
