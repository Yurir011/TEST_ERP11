from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str
    work_date: date
    clock_in: datetime | None
    clock_out: datetime | None
