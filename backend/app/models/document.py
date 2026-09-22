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
    employment_en = "employment_en"  # 재직증명서 (영문)


class DocumentStatus(str, enum.Enum):
    pending = "pending"  # 결재 요청됨, 승인 대기 중
    approved = "approved"  # 결재 승인 완료 - PDF 발급됨, 다운로드 가능
    rejected = "rejected"  # 반려됨


class DocumentIssue(Base):
    __tablename__ = "document_issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType))
    purpose: Mapped[str | None] = mapped_column(String(200), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="documentstatus"), default=DocumentStatus.pending
    )
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 배정된 결재권자 (팀장/대표)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    approver: Mapped["User | None"] = relationship(foreign_keys=[approver_id])
