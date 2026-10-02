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
    color: str = "grayblue"
    is_lunar: bool = False
    recurrence_freq: str = "none"
    recurrence_weekdays: list[int] | None = None  # 0=일 ... 6=토 (JS Date.getDay() 기준)
    recurrence_until: date | None = None
    # 음력 + 매년 반복일 때, 프런트(lunar-javascript)에서 음력 기준으로 계산한 각 회차의 양력 날짜 목록.
    # 음력은 해마다 대응 양력 날짜가 달라 서버에서 solar+N년 방식으로 생성할 수 없어 이 목록을 그대로 사용한다.
    lunar_occurrence_dates: list[date] | None = None

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
        if self.is_lunar:
            if self.start_date != self.end_date:
                raise ValueError("음력 일정은 하루짜리 일정만 등록할 수 있습니다.")
            if self.recurrence_freq not in ("none", "yearly"):
                raise ValueError("음력 일정은 반복 없음 또는 매년 반복만 선택할 수 있습니다.")
            if self.recurrence_freq == "yearly":
                if not self.lunar_occurrence_dates:
                    raise ValueError("음력 매년 반복 날짜 목록이 필요합니다.")
                if len(self.lunar_occurrence_dates) > MAX_OCCURRENCES:
                    raise ValueError(f"반복 일정은 최대 {MAX_OCCURRENCES}회까지 생성할 수 있습니다.")
            return self

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
    is_lunar: bool
    is_completed: bool
    sort_order: int
    recurrence_group_id: str | None
    created_by: int
    created_by_name: str
    created_at: datetime


class ScheduleReorderRequest(BaseModel):
    direction: str  # "up" | "down"
    date: date
