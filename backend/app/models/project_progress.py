import enum
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.project import Project

MAX_PROGRESS_STAGES = 5


class PurchaseStepKey(str, enum.Enum):
    request = "request"  # 요청
    approval = "approval"  # 승인
    purchase = "purchase"  # 구매
    payment = "payment"  # 지급
    delivery = "delivery"  # 입고·전달


PURCHASE_STEP_LABELS: dict[PurchaseStepKey, str] = {
    PurchaseStepKey.request: "요청",
    PurchaseStepKey.approval: "승인",
    PurchaseStepKey.purchase: "구매",
    PurchaseStepKey.payment: "지급",
    PurchaseStepKey.delivery: "입고·전달",
}


class ProjectProgressStage(Base):
    """프로젝트별로 자유롭게 등록하는 진행 상황 단계(최대 MAX_PROGRESS_STAGES개). 체크박스처럼 수동으로 완료 처리한다."""

    __tablename__ = "project_progress_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="progress_stages")


class ProjectPurchaseStep(Base):
    """프로젝트마다 공통으로 갖는 구매 진행 5단계(요청~입고·전달). 수동으로 완료 처리한다."""

    __tablename__ = "project_purchase_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    step_key: Mapped[PurchaseStepKey] = mapped_column(Enum(PurchaseStepKey, name="purchasestepkey"))
    order_index: Mapped[int] = mapped_column(Integer)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 이름을 직접 수정한 경우에만 값이 들어가며, 없으면 PURCHASE_STEP_LABELS의 기본 이름을 사용한다.
    custom_label: Mapped[str | None] = mapped_column(String(50), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="purchase_steps")
