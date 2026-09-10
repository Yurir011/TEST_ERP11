from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TodoCreate(BaseModel):
    content: str


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    is_done: bool
    created_at: datetime
