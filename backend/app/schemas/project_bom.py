from datetime import date

from pydantic import BaseModel, Field, field_validator

MAX_QUANTITY = 100_000_000


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


class BomLineCreate(BaseModel):
    material_id: int | None = None  # 자재관리에 등록된 자재면 그 id, 아직 없으면 비우고 item_name 만 적는다
    item_name: str | None = Field(default=None, max_length=200)
    quantity: int = Field(gt=0, le=MAX_QUANTITY)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("item_name", "note")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return _clean(v)


class BomLineUpdate(BaseModel):
    quantity: int | None = Field(default=None, gt=0, le=MAX_QUANTITY)
    note: str | None = Field(default=None, max_length=500)
    material_id: int | None = None  # 미등록 줄을 자재관리에 등록한 뒤 연결할 때 쓴다 (이미 연결된 줄은 바꾸지 않는다)

    @field_validator("note")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return _clean(v)


class BomLineOut(BaseModel):
    id: int
    material_id: int | None
    registered: bool  # 자재관리에 등록된 자재인가
    code: str | None
    item_name: str
    category_label: str | None
    sub_levels: list[str]
    quantity: int
    note: str | None
    current_qty: int | None  # 연결된 자재의 현재 재고 (미등록이면 None)
    shortage: int | None  # 재고가 모자라는 개수 (넉넉하거나 미등록이면 None)
    released: int  # 이 줄로 지금까지 출고한 개수 (자재관리의 출고 기록 중 이 BOM 줄과 연결된 것의 합)


class BomReleaseItem(BaseModel):
    line_id: int
    quantity: int = Field(gt=0, le=MAX_QUANTITY)


class BomReleaseIn(BaseModel):
    """BOM 에서 고른 줄을 한꺼번에 출고한다 (줄마다 출고 수량). 하나라도 안 되면 전체를 취소한다."""

    items: list[BomReleaseItem] = Field(min_length=1, max_length=500)
    release_date: date | None = None  # 비우면 오늘
