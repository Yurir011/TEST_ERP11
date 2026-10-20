from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User


class ProjectDateNote(Base):
    """프로젝트 상세의 "날짜별 메모". 날짜를 지정해 남기는 자유 메모이며, 같은 날짜에 여러 개를 남길 수 있다."""

    __tablename__ = "project_date_notes"
    __table_args__ = (Index("ix_project_date_notes_project_date", "project_id", "note_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    note_date: Mapped[date] = mapped_column(Date)  # 메모를 남긴 "대상 날짜" (작성한 날과 다를 수 있다)
    content: Mapped[str] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="date_notes")
    author: Mapped["User | None"] = relationship()
