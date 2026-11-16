from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

# 파일 버전 하나에 묶는 7개 항목. Firmware·GUI 는 bin / src 두 묶음으로 나눈다.
RELEASE_CATEGORIES = ("bom", "gerber", "pnp", "kicad", "step", "firmware", "gui")
GROUPED_CATEGORIES = ("firmware", "gui")
RELEASE_GROUPS = ("bin", "src")


class ProjectRelease(Base):
    """프로젝트 파일 버전(예: V.1.10.000, 2026/08/10). 그 아래에 BOM·Gerber·Pick Place·KiCad·STEP·Firmware·GUI 파일을 올린다."""

    __tablename__ = "project_releases"
    __table_args__ = (UniqueConstraint("project_id", "version", name="uq_project_release_version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(30))
    release_date: Mapped[date] = mapped_column(Date)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    files: Mapped[list["ProjectReleaseFile"]] = relationship(back_populates="release", cascade="all, delete-orphan", order_by="ProjectReleaseFile.id")


class ProjectReleaseFile(Base):
    __tablename__ = "project_release_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    release_id: Mapped[int] = mapped_column(ForeignKey("project_releases.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    group: Mapped[str | None] = mapped_column(String(10), nullable=True)  # firmware·gui 만: bin | src
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    release: Mapped["ProjectRelease"] = relationship(back_populates="files")
