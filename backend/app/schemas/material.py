from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_SUB_LEVELS = 10  # 하위 속성 단계는 필요하면 늘려 쓸 수 있지만 무한정은 아니다
MAX_QUANTITY = 1_000_000_000

Category = Literal["ic", "injection", "subsidiary"]
Kind = Literal["in", "add", "out"]


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


class MovementIn(BaseModel):
    """입고(in) / 추가 입고(add) / 출고(out) 한 줄. 출고에는 사유가 반드시 필요하다."""

    kind: Kind
    movement_date: date
    quantity: int = Field(gt=0, le=MAX_QUANTITY)
    reason: str | None = None  # 출고 사유
    note: str | None = None  # 메모(입고) / 사유 자세히(출고)

    @field_validator("reason", "note")
    @classmethod
    def _opt(cls, v: str | None) -> str | None:
        return _clean(v)

    @model_validator(mode="after")
    def _out_needs_reason(self):
        if self.kind == "out" and not self.reason:
            raise ValueError("출고 사유를 입력해주세요.")
        if self.kind != "out":
            self.reason = None  # 사유는 출고에서만 쓴다
        return self


class InitialInIn(BaseModel):
    movement_date: date
    quantity: int = Field(gt=0, le=MAX_QUANTITY)


class MaterialIn(BaseModel):
    category: Category
    name: str
    sub_levels: list[str] = []  # 비어 있는 단계는 건너뛰고 채운 것만 위에서부터 차례로 저장한다
    memo: str | None = None
    initial_in: InitialInIn | None = None  # 등록하면서 처음 입고를 함께 기록 (수정에서는 쓰지 않는다)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("이름을 입력해주세요.")
        return v

    @field_validator("sub_levels")
    @classmethod
    def _levels(cls, v: list[str]) -> list[str]:
        levels = [s.strip() for s in v if s and s.strip()]
        if len(levels) > MAX_SUB_LEVELS:
            raise ValueError(f"하위 속성은 {MAX_SUB_LEVELS}단계까지 적을 수 있습니다.")
        if any(len(s) > 100 for s in levels):
            raise ValueError("하위 속성은 한 칸에 100자까지 적을 수 있습니다.")
        return levels

    @field_validator("memo")
    @classmethod
    def _memo(cls, v: str | None) -> str | None:
        return _clean(v)


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    movement_date: date
    quantity: int
    reason: str | None
    note: str | None
    created_by: int
    created_by_name: str | None = None
    created_at: datetime


class MovementBrief(BaseModel):
    movement_date: date
    quantity: int


class MaterialOut(BaseModel):
    """목록 한 줄: 항목·이름·하위 속성, 현재 개수, 가장 최근 입고(추가 입고 포함)·출고."""

    id: int
    category: str
    category_label: str
    name: str
    sub_levels: list[str]
    current_qty: int
    last_in: MovementBrief | None
    last_out: MovementBrief | None
    updated_at: datetime


class MaterialDetailOut(MaterialOut):
    memo: str | None
    total_in: int  # 입고 합계
    total_add: int  # 추가 입고 합계
    total_out: int  # 출고 합계
    movements: list[MovementOut]  # 최근순
