from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.proposal import ProposalAttachmentKind, ProposalStatus, ProposalStepStatus
from app.models.user import JobTitle

# 결재 시작 단계를 고르면 나머지 결재선이 자동으로 정해진다. 마지막 단계는 항상 대표(ceo).
STEP_CHAINS: dict[JobTitle, list[JobTitle]] = {
    JobTitle.dept_head: [JobTitle.dept_head, JobTitle.team_lead, JobTitle.ceo],
    JobTitle.team_lead: [JobTitle.team_lead, JobTitle.ceo],
    JobTitle.ceo: [JobTitle.ceo],
}


class ProposalCreate(BaseModel):
    kind: str | None = None
    title: str
    topic: str
    content: str
    start_title: JobTitle  # 결재 시작 단계 (부서장/팀장/대표)
    approver_ids: list[int]  # start_title로 정해진 단계 수(1~3)만큼, 순서대로

    @field_validator("approver_ids")
    @classmethod
    def validate_length(cls, v: list[int]) -> list[int]:
        if not v or len(v) > 3:
            raise ValueError("결재자는 1명 이상 3명 이하로 지정해야 합니다.")
        return v


class RejectIn(BaseModel):
    reason: str


class ProposalLinkAttachmentIn(BaseModel):
    url: str = Field(min_length=1)
    label: str | None = None


class ProposalAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: ProposalAttachmentKind
    label: str
    url: str | None
    created_by: int
    created_at: datetime


class ProposalStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_order: int
    title: JobTitle
    approver_id: int
    approver_name: str
    status: ProposalStepStatus
    decided_at: datetime | None


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_no: str
    kind: str | None
    title: str
    topic: str
    content: str
    department_name: str
    issue_date: date
    status: ProposalStatus
    current_step: int
    created_by: int
    creator_name: str
    steps: list[ProposalStepOut]
    attachments: list[ProposalAttachmentOut]
    has_pdf: bool
    reject_reason: str | None
    created_at: datetime
