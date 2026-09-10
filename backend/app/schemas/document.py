from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.document import DocumentType


class DocumentIssueRequest(BaseModel):
    doc_type: DocumentType
    purpose: str | None = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    doc_type: DocumentType
    purpose: str | None
    issued_at: datetime
