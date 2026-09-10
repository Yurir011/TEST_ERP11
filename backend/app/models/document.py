import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class DocumentType(str, enum.Enum):
    employment = "employment"  # 재직증명서
    career = "career"  # 경력증명서


class DocumentIssue(Base):
    __tablename__ = "document_issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType))
    purpose: Mapped[str | None] = mapped_column(String(200), nullable=True)
    file_path: Mapped[str] = mapped_column(String(500))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()
