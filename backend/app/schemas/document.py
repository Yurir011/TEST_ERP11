from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.document import DocumentStatus, DocumentType


class DocumentIssueRequest(BaseModel):
    doc_type: DocumentType
    purpose: str | None = None
    approver_id: int


class RejectIn(BaseModel):
    reason: str


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str
    doc_type: DocumentType
    purpose: str | None
    status: DocumentStatus
    approver_id: int | None
    approver_name: str | None
    reviewed_at: datetime | None
    reject_reason: str | None
    has_pdf: bool
    issued_at: datetime
