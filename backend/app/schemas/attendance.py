from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AttendanceUpdate(BaseModel):
    """관리자가 직원의 하루 근태 시각을 고칠 때 보내는 값 (둘 다 필수, 퇴근은 null 이면 근무중)"""

    clock_in: datetime
    clock_out: datetime | None = None


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str
    work_date: date
    clock_in: datetime | None
    clock_out: datetime | None
