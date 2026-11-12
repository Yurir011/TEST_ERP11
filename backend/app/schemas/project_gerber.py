from datetime import datetime

from pydantic import BaseModel


class GerberOut(BaseModel):
    id: int
    project_id: int
    revision: str
    filename: str
    file_size: int
    layer_names: list[str]
    note: str | None
    uploaded_by: str | None  # 올린 사람 이름
    created_at: datetime
    is_latest: bool
