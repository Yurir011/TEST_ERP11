from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    granted: int  # 이번 주기 발생 연차 = 자동 발생(근로기준법) + 관리자 조정
    auto_granted: int = 0  # 입사일 기준 근로기준법 자동 발생분
    adjustment: int = 0  # 관리자가 더하거나 뺀 일수
    carried_deficit: int = 0  # 지난 주기에 당겨 써서 이번 주기에서 먼저 차감되는 일수
    used: int
    pending: int
    remaining: int  # 마이너스면 연차를 미리 당겨 쓴 것
    advance_limit: int = 0  # 이번 주기에 당겨 쓸 수 있는 최대 일수 (다음 주기 발생 연차만큼)
    hire_date: date | None = None
    period_start: date
    period_end: date


class LeaveBalanceRowOut(LeaveBalanceOut):
    """관리자용 직원별 연차 현황 한 줄"""

    user_id: int
    user_name: str


class LeaveAdjustmentCreate(BaseModel):
    user_id: int
    days: int = Field(description="더하면 +, 빼면 - (0 은 불가)")
    reason: str = Field(min_length=1, max_length=300)
    effective_date: date | None = None  # 비우면 오늘

    @field_validator("days")
    @classmethod
    def _days_not_zero(cls, v: int) -> int:
        if v == 0 or abs(v) > 60:
            raise ValueError("조정 일수는 0 이 아닌 -60 ~ 60 사이 정수여야 합니다.")
        return v

    @field_validator("reason")
    @classmethod
    def _reason_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("조정 사유를 입력해주세요.")
        return v


class LeaveAdjustmentOut(BaseModel):
    id: int
    user_id: int
    days: int
    reason: str
    effective_date: date
    created_by_name: str | None
    created_at: datetime
