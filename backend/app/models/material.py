from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

# 자재 항목(분류): 회로부품 / 사출물 / 부자재 / 포장재 / 소모품 중 하나. 항목별로 모아 볼 수 있다. (저장 값 "ic" 는 예전 이름이며 화면에는 "회로부품"으로 보인다)
MATERIAL_CATEGORIES = ("ic", "injection", "subsidiary", "packaging", "consumable")
CATEGORY_LABELS = {"ic": "회로부품", "injection": "사출물", "subsidiary": "부자재", "packaging": "포장재", "consumable": "소모품"}

# 회로부품만 전용 / 범용 으로 나눈다 (다른 항목은 종류가 없다)
KINDS = ("dedicated", "general")
KIND_LABELS = {"dedicated": "전용", "general": "범용"}

# 품목 코드 접두어. 세부 항목별 코드는 나중에 이 표(또는 code_prefix)에 추가한다. 코드 = 접두어 + "-" + 4자리 순번 (예: EC-0001), 순번은 접두어마다 따로 센다.
CODE_PREFIXES = {
    ("ic", "dedicated"): "EC",
    ("ic", "general"): "EG",
    ("injection", None): "ME",
    ("subsidiary", None): "SU",
    ("packaging", None): "PK",
    ("consumable", None): "CS",
}


def code_prefix(category: str, kind: str | None) -> str:
    return CODE_PREFIXES[(category, kind if category == "ic" else None)]

# 입출고 종류: 입고(처음) / 추가 입고 / 재입고(출고했다가 남아서 돌아온 것) / 출고. 현재 개수 = 입고 + 추가 입고 + 재입고 - 출고
MOVEMENT_KINDS = ("in", "add", "return", "out")
IN_KINDS = ("in", "add", "return")  # 개수를 더하는 종류


class Material(Base):
    """자재. 항목(회로부품/사출물/부자재/소모품) + 이름을 붙이고, 그 아래 비워 둘 수 있는 속성(트리, 1단계→2단계→3단계…)을 적는다.

    현재 개수는 저장하지 않고 입출고 기록(MaterialMovement)의 합계로 계산한다 (수량을 직접 고치지 않으므로 틀려도 추적할 수 있다).
    """

    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    kind: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 회로부품의 전용(dedicated) / 범용(general). 다른 항목은 비어 있다.
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)  # 품목 코드 (예: EC-0001). 저장할 때 자동으로 붙는다.
    name: Mapped[str] = mapped_column(String(200), index=True)
    # 속성: 위 단계부터 순서대로. 비어 있는 단계는 저장하지 않는다 (예: ["MCU", "ARM Cortex-M3", "LQFP48"])
    sub_levels: Mapped[list[str]] = mapped_column(ARRAY(String(100)), default=list, server_default="{}")
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    movements: Mapped[list["MaterialMovement"]] = relationship(
        back_populates="material", cascade="all, delete-orphan", order_by="MaterialMovement.movement_date.desc(), MaterialMovement.id.desc()"
    )


class MaterialMovement(Base):
    """자재 입출고 한 줄. 출고(out)에는 사유(reason)가 반드시 있다."""

    __tablename__ = "material_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    movement_date: Mapped[date] = mapped_column(Date)
    quantity: Mapped[int] = mapped_column(Integer)  # 항상 양수, 낱개(개) 기준 총 개수 (더할지 뺄지는 kind 로 정한다)
    reels: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 릴로 기록한 경우 릴 수 합계
    # 릴로 기록한 경우 "개수 × 릴 수" 묶음들: [{"per_reel": 2500, "reels": 2}, {"per_reel": 2480, "reels": 1}] (quantity = 개수×릴 수의 합, reels = 릴 수의 합)
    reel_groups: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # 재입고(return)일 때만: 어느 출고 건의 반납인지, 그중 실제 사용한 개수 (로스 = 출고 - 반납 합계 - 사용 합계). 사용 개수를 모르면 비워 둔다.
    return_of: Mapped[int | None] = mapped_column(ForeignKey("material_movements.id"), nullable=True, index=True)
    used_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 프로젝트 BOM 에서 출고한 기록이면 그 BOM 줄 (BOM 줄이 지워져도 출고 기록은 남는다)
    bom_line_id: Mapped[int | None] = mapped_column(ForeignKey("project_bom_lines.id", ondelete="SET NULL"), nullable=True, index=True)
    reason: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 출고 사유 (출고에서 필수)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 메모(입고) / 사유 자세히(출고)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    material: Mapped["Material"] = relationship(back_populates="movements")
