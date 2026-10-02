import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
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
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 현재(또는 마지막) 결재 처리 대상자
    current_step: Mapped[int] = mapped_column(Integer, default=1)  # 다단계 결재선에서 현재 대기 중인 단계 (1부터 시작)
    is_final_decision: Mapped[bool] = mapped_column(Boolean, default=False)  # 전결 여부 (결재선 없이 본인 결재로 즉시 완료)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    approver: Mapped["User | None"] = relationship(foreign_keys=[approver_id])
