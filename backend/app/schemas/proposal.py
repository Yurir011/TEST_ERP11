from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.proposal import ProposalAttachmentKind, ProposalStatus, ProposalStepStatus
from app.models.user import JobTitle


class ProposalCreate(BaseModel):
    kind: str | None = None
    title: str
    topic: str
    content: str
    issue_date: date | None = None  # 기안일자. 비우면 오늘
    is_final_decision: bool = False
    end_title: JobTitle | None = None  # 결재선 종료 단계 (부서장/팀장/대표). 전결이면 불필요
    approver_ids: list[int] = Field(default_factory=list)  # 부서장부터 end_title까지의 단계 수만큼, 순서대로. 전결이면 불필요

    @field_validator("approver_ids")
    @classmethod
    def validate_length(cls, v: list[int]) -> list[int]:
        if len(v) > 3:
            raise ValueError("결재자는 3명 이하로 지정해야 합니다.")
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
    is_final_decision: bool
    created_by: int
    creator_name: str
    steps: list[ProposalStepOut]
    attachments: list[ProposalAttachmentOut]
    has_pdf: bool
    reject_reason: str | None
    created_at: datetime
