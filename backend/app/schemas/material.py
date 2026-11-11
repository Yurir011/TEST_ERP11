from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_SUB_LEVELS = 10  # 속성 단계는 필요하면 늘려 쓸 수 있지만 무한정은 아니다
MAX_QUANTITY = 1_000_000_000

Category = Literal["ic", "injection", "subsidiary", "packaging", "consumable"]  # ic = 회로부품
MaterialKind = Literal["dedicated", "general"]  # 회로부품의 전용 / 범용
Kind = Literal["in", "add", "return", "out"]


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


class ReelGroup(BaseModel):
    """릴 묶음 하나: "개수 × 릴 수" (예: 2,500개짜리 릴 2개). 릴마다 개수가 다르면 묶음을 여러 개 준다."""

    per_reel: int = Field(gt=0, le=MAX_QUANTITY)  # 릴 하나의 개수
    reels: int = Field(gt=0, le=MAX_QUANTITY)  # 그런 릴의 수


MAX_REEL_GROUPS = 100


class _Qty(BaseModel):
    """수량: 개로 적으면 quantity 만, 릴로 적으면 reel_groups("개수 × 릴 수" 묶음들)를 주고, 총 개수 quantity 와 릴 수 reels 는 묶음에서 정한다."""

    quantity: int | None = Field(default=None, gt=0, le=MAX_QUANTITY)
    reel_groups: list[ReelGroup] | None = Field(default=None, max_length=MAX_REEL_GROUPS)
    reels: int | None = None  # 응답 전용: 릴 수 합계 (입력값은 무시하고 reel_groups 에서 정한다)

    @model_validator(mode="after")
    def _qty(self):
        if self.reel_groups:
            self.quantity = sum(g.per_reel * g.reels for g in self.reel_groups)
            self.reels = sum(g.reels for g in self.reel_groups)
            if self.quantity > MAX_QUANTITY:
                raise ValueError("개수가 너무 큽니다.")
        elif self.quantity is None:
            raise ValueError("개수를 입력해주세요.")
        else:
            self.reel_groups = None
            self.reels = None
        return self


class MovementIn(_Qty):
    """입고(in) / 추가 입고(add) / 출고(out) 한 줄. 출고에는 사유가 반드시 필요하다."""

    kind: Kind
    movement_date: date
    return_of: int | None = None  # 재입고(return)일 때 필수: 어느 출고 건의 반납인지 (그 출고 기록의 id)
    used_qty: int | None = Field(default=None, ge=0, le=MAX_QUANTITY)  # 재입고일 때 그중 실제 사용한 개수 (모르면 비움)
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
        if self.kind == "return":
            if self.return_of is None:
                raise ValueError("어느 출고 건의 재입고인지 골라주세요.")
        else:
            self.return_of = None  # 재입고에서만 쓴다
            self.used_qty = None
        return self


class InitialInIn(_Qty):
    movement_date: date


class MaterialIn(BaseModel):
    category: Category
    kind: MaterialKind | None = None  # 회로부품이면 필수(전용/범용), 다른 항목은 쓰지 않는다
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
            raise ValueError(f"속성은 {MAX_SUB_LEVELS}단계까지 적을 수 있습니다.")
        if any(len(s) > 100 for s in levels):
            raise ValueError("속성은 한 칸에 100자까지 적을 수 있습니다.")
        return levels

    @field_validator("memo")
    @classmethod
    def _memo(cls, v: str | None) -> str | None:
        return _clean(v)

    @model_validator(mode="after")
    def _kind(self):
        if self.category == "ic" and self.kind is None:
            raise ValueError("회로부품은 전용 또는 범용을 골라주세요.")
        if self.category != "ic":
            self.kind = None
        return self


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    movement_date: date
    quantity: int
    reels: int | None = None
    reel_groups: list[ReelGroup] | None = None  # 릴로 기록한 경우 "개수 × 릴 수" 묶음들
    return_of: int | None = None  # 재입고: 반납 대상 출고 기록 id
    used_qty: int | None = None  # 재입고: 그중 사용한 개수 (적지 않았으면 None)
    returned_qty: int | None = None  # 출고: 이 출고에서 재입고된 개수 합계 (재입고가 하나라도 있을 때만)
    used_total: int | None = None  # 출고: 사용한 개수 합계 (사용 개수를 적은 재입고가 하나라도 있을 때만)
    loss_qty: int | None = None  # 출고: 로스 = 출고 − 반납 합계 − 사용 합계 (사용 개수를 적은 재입고가 있을 때만)
    reason: str | None
    note: str | None
    created_by: int
    created_by_name: str | None = None
    created_at: datetime


class MovementBrief(BaseModel):
    movement_date: date
    quantity: int
    reels: int | None = None
    reel_groups: list[ReelGroup] | None = None


class MaterialBulkDeleteIn(BaseModel):
    """목록에서 체크한 자재를 한꺼번에 지운다."""

    ids: list[int] = Field(min_length=1, max_length=500)


class MaterialBulkDeleteOut(BaseModel):
    deleted: int


class MaterialBulkLevelsIn(BaseModel):
    """목록에서 체크한 자재의 분류(속성 경로)를 한꺼번에 같은 값으로 바꾼다. 비워 두면 안 된다."""

    ids: list[int] = Field(min_length=1, max_length=500)
    sub_levels: list[str]

    @field_validator("sub_levels")
    @classmethod
    def _levels(cls, v: list[str]) -> list[str]:
        levels = [s.strip() for s in v if s and s.strip()]
        if not levels:
            raise ValueError("바꿀 분류를 한 칸 이상 입력해주세요.")
        if len(levels) > MAX_SUB_LEVELS:
            raise ValueError(f"속성은 {MAX_SUB_LEVELS}단계까지 적을 수 있습니다.")
        if any(len(s) > 100 for s in levels):
            raise ValueError("속성은 한 칸에 100자까지 적을 수 있습니다.")
        return levels


class MaterialBulkLevelsOut(BaseModel):
    updated: int


class MaterialOut(BaseModel):
    """목록 한 줄: 항목·이름·속성, 현재 개수, 가장 최근 입고(추가 입고 포함)·출고."""

    id: int
    code: str
    category: str
    category_label: str
    kind: str | None = None
    kind_label: str | None = None
    name: str
    sub_levels: list[str]
    current_qty: int
    current_reels: int | None = None  # 릴로 기록한 입출고가 있을 때만: 릴 수 합계 (입고 + 추가 입고 − 출고)
    last_in: MovementBrief | None
    last_out: MovementBrief | None
    updated_at: datetime


class MaterialDetailOut(MaterialOut):
    memo: str | None
    total_in: int  # 입고 합계
    total_add: int  # 추가 입고 합계
    total_out: int  # 출고 합계
    total_return: int = 0  # 재입고 합계
    total_loss: int = 0  # 로스 합계 (사용 개수를 적어 정산된 출고 건만)
    movements: list[MovementOut]  # 최근순
