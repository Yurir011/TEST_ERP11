from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class ProjectGerber(Base):
    """프로젝트에 등록한 거버 한 벌(zip)과 그 버전(Rev A, B ...). 화면(브라우저)이 zip 을 받아 직접 그려 보여 준다."""

    __tablename__ = "project_gerbers"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    revision: Mapped[str] = mapped_column(String(20))  # "Rev A", "Rev B" ... 등록할 때 자동으로 붙는다
    filename: Mapped[str] = mapped_column(String(255))  # 올린 파일 이름 (다운로드 때 쓴다)
    file_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer)
    layer_names: Mapped[list] = mapped_column(JSONB, default=list)  # zip 안의 파일 이름들
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    uploader = relationship("User", foreign_keys=[created_by])
