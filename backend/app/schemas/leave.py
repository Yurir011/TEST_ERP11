from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.leave import LeaveStatus


class LeaveCreate(BaseModel):
    start_date: date
    end_date: date
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
