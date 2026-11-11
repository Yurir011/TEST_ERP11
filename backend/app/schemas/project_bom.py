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
