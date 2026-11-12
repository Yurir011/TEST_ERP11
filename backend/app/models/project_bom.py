from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.project import Project


class ProjectBomLine(Base):
    """프로젝트(=제품 생산)의 BOM 한 줄: 어떤 자재가 몇 개 필요한가.

    자재관리에 등록된 자재면 material 에 연결하고, 아직 등록되지 않은 자재는 material_id 없이 이름(item_name)만 적어 둔다
    (나중에 자재관리에 등록하면서 연결할 수 있다). 자동 출고는 아직 없고, 필요 수량과 현재 재고를 견주어 보는 용도다.
    """

    __tablename__ = "project_bom_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    material_id: Mapped[int | None] = mapped_column(ForeignKey("materials.id", ondelete="SET NULL"), nullable=True, index=True)
    item_name: Mapped[str] = mapped_column(String(200))  # 연결된 자재의 이름을 복사해 둔다 (자재가 지워져도 줄은 남는다)
    quantity: Mapped[int] = mapped_column(Integer)  # 이 프로젝트에 필요한 총 개수
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 재고 부족으로 출고에서 빠진 제품 개수 (이 줄의 자재를 나중에 따로 출고해야 하는 보류분, 제품 개수 기준)
    pending_units: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="bom_lines")
    material: Mapped["Material | None"] = relationship()
