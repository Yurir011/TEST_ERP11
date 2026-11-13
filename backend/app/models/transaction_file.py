from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class TransactionFile(Base):
    """매입매출 한 건에 붙인 세금계산서 파일 (PDF·이미지·XML·엑셀 등). 여러 개를 붙일 수 있다."""

    __tablename__ = "transaction_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))  # 올린 파일 이름 (다운로드 때 쓴다)
    file_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    uploader = relationship("User", foreign_keys=[created_by])
