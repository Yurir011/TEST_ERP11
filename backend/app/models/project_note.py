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
    # 답글이면 답글을 단 대상(원 메모 또는 다른 답글, 단계 제한 없음). 답글은 원 메모와 같은 날짜에 붙고, 대상을 지우면 그 아래 답글도 함께 지워진다.
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("project_date_notes.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # 작성자가 내용을 고친 시각 (고치지 않았으면 None)

    project: Mapped["Project"] = relationship(back_populates="date_notes")
    author: Mapped["User | None"] = relationship()
