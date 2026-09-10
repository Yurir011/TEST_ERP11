from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.schedule import EVENT_COLORS

RECURRENCE_FREQS = ("none", "daily", "weekly", "yearly")
MAX_OCCURRENCES = 366


class ScheduleEventCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: date
    end_date: date
    color: str = "blue"
    recurrence_freq: str = "none"
    recurrence_weekdays: list[int] | None = None  # 0=일 ... 6=토 (JS Date.getDay() 기준)
    recurrence_until: date | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if v not in EVENT_COLORS:
            raise ValueError(f"color must be one of {EVENT_COLORS}")
        return v

    @field_validator("recurrence_freq")
    @classmethod
    def validate_freq(cls, v: str) -> str:
        if v not in RECURRENCE_FREQS:
            raise ValueError(f"recurrence_freq must be one of {RECURRENCE_FREQS}")
        return v

    @model_validator(mode="after")
    def validate_recurrence(self):
        if self.recurrence_freq != "none":
            if self.recurrence_until is None:
                raise ValueError("반복 종료일(recurrence_until)이 필요합니다.")
            if self.recurrence_until < self.start_date:
                raise ValueError("반복 종료일은 시작일보다 빠를 수 없습니다.")
            if self.recurrence_freq == "weekly" and not self.recurrence_weekdays:
                raise ValueError("매주 반복은 요일을 1개 이상 선택해야 합니다.")
        return self


class ScheduleEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    start_date: date
    end_date: date
    color: str
    is_completed: bool
    sort_order: int
    recurrence_group_id: str | None
    created_by: int
    created_by_name: str
    created_at: datetime


class ScheduleReorderRequest(BaseModel):
    direction: str  # "up" | "down"
    date: date
