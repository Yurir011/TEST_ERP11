from datetime import datetime

from pydantic import BaseModel


class ProjectFileOut(BaseModel):
    id: int
    project_id: int
    kind: str
    revision: str
    filename: str
    file_size: int
    note: str | None
    uploaded_by: str | None
    created_at: datetime
    is_latest: bool
