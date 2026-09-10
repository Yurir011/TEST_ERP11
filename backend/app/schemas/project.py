from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    client_id: int
    memo: str | None = None


class ProjectStatusUpdate(BaseModel):
    status: ProjectStatus


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    client_id: int
    client_name: str
    status: ProjectStatus
    memo: str | None
    created_at: datetime
    updated_at: datetime
