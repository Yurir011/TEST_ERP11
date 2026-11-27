from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeliveryIn(BaseModel):
    delivered_on: date
    quantity: int = Field(gt=0, le=10_000_000)
    memo: str | None = None

    @field_validator("memo")
    @classmethod
    def _clean_memo(cls, v: str | None) -> str | None:
        return (v or "").strip()[:300] or None


class DeliveryStatusIn(BaseModel):
    completed: bool
    record: DeliveryIn | None = None  # 완료하면서 함께 적는 납품 한 건 (완료를 취소하면 이 기록도 지워진다)


class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    delivered_on: date
    quantity: int
    memo: str | None
    created_at: datetime


class DeliveryListOut(BaseModel):
    items: list[DeliveryOut]
    total_count: int
    total_quantity: int


class MonthStat(BaseModel):
    month: int
    count: int
    quantity: int


class ProjectDeliveryStat(BaseModel):
    project_id: int
    name: str
    client_name: str
    count: int
    quantity: int
    months: list[MonthStat]  # 납품이 있는 달만


class DeliveryStatsOut(BaseModel):
    year: int
    years: list[int]  # 납품 기록이 있는 연도(최신순) + 선택한 연도
    total_count: int
    total_quantity: int
    project_count: int
    client_count: int
    prev_count: int  # 작년 같은 기간(1월 ~ 지금과 같은 월·일)
    prev_quantity: int
    monthly: list[MonthStat]  # 1~12월 모두
    projects: list[ProjectDeliveryStat]  # 개수 많은 순
