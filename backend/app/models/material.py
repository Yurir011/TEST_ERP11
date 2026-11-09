from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

# 자재 항목(분류): IC / 사출물 / 부자재 중 하나. 항목별로 모아 볼 수 있다.
MATERIAL_CATEGORIES = ("ic", "injection", "subsidiary")
CATEGORY_LABELS = {"ic": "IC", "injection": "사출물", "subsidiary": "부자재"}

# 입출고 종류: 입고(처음) / 추가 입고 / 출고. 현재 개수 = 입고 + 추가 입고 - 출고
MOVEMENT_KINDS = ("in", "add", "out")


class Material(Base):
    """자재. 항목(IC/사출물/부자재) + 이름을 붙이고, 그 아래 비워 둘 수 있는 하위 속성(트리, 1단계→2단계→3단계…)을 적는다.

    현재 개수는 저장하지 않고 입출고 기록(MaterialMovement)의 합계로 계산한다 (수량을 직접 고치지 않으므로 틀려도 추적할 수 있다).
    """

    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    # 하위 속성: 위 단계부터 순서대로. 비어 있는 단계는 저장하지 않는다 (예: ["MCU", "ARM Cortex-M3", "LQFP48"])
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
    quantity: Mapped[int] = mapped_column(Integer)  # 항상 양수 (더할지 뺄지는 kind 로 정한다)
    reason: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 출고 사유 (출고에서 필수)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 메모(입고) / 사유 자세히(출고)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    material: Mapped["Material"] = relationship(back_populates="movements")
