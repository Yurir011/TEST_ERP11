from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    user_id: int | None
    user_name: str | None
    ip: str | None
    request: str | None
    action: str
    entity_type: str
    entity_id: int | None
    changes: dict | None
    summary: str | None
