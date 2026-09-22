import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.project_progress import ProjectProgressStage, ProjectPurchaseStep
    from app.models.user import User


class ProjectStatus(str, enum.Enum):
    estimate = "estimate"  # 견적
    in_progress = "in_progress"  # 진행
    completed = "completed"  # 완료


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.estimate)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 대시보드 간트차트(프로젝트 진행 현황)용 일정/진행율. 10% 단위로만 저장한다.
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped["Client"] = relationship()
    creator: Mapped["User"] = relationship()
    progress_stages: Mapped[list["ProjectProgressStage"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ProjectProgressStage.order_index"
    )
    purchase_steps: Mapped[list["ProjectPurchaseStep"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ProjectPurchaseStep.order_index"
    )
