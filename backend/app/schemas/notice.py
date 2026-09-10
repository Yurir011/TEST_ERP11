from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NoticeCreate(BaseModel):
    title: str
    content: str


class NoticeUpdate(BaseModel):
    title: str
    content: str


class NoticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    author_name: str
    created_at: datetime
    updated_at: datetime
