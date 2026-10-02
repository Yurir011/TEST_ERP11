from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.leave import LeaveStatus
from app.models.user import JobTitle
from app.schemas.approval import ApprovalStepOut


class LeaveCreate(BaseModel):
    start_date: date
    end_date: date
    reason: str
    is_final_decision: bool = False
    end_title: JobTitle | None = None  # 결재선 종료 단계 (부서장/팀장/대표). 전결이면 불필요
    approver_ids: list[int] = Field(default_factory=list)  # end_title까지의 단계 수만큼, 순서대로(부서장→팀장→대표)


class RejectIn(BaseModel):
    reason: str


class LeaveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str
    start_date: date
    end_date: date
    days: int
    reason: str
    status: LeaveStatus
    current_step: int
    steps: list[ApprovalStepOut]
    approver_id: int | None
    approver_name: str | None
    is_final_decision: bool
    reject_reason: str | None
    reviewed_by_name: str | None
    reviewed_at: datetime | None
    created_at: datetime


class LeaveBalanceOut(BaseModel):
    granted: int
    used: int
    pending: int
    remaining: int
    period_start: date
    period_end: date
