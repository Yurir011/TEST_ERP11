from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import DocumentStatus, DocumentType
from app.models.user import JobTitle
from app.schemas.approval import ApprovalStepOut


class DocumentIssueRequest(BaseModel):
    doc_type: DocumentType
    purpose: str | None = None
    is_final_decision: bool = False
    end_title: JobTitle | None = None
    approver_ids: list[int] = Field(default_factory=list)


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
    current_step: int
    steps: list[ApprovalStepOut]
    approver_id: int | None
    approver_name: str | None
    is_final_decision: bool
    reviewed_at: datetime | None
    reject_reason: str | None
    has_pdf: bool
    issued_at: datetime
