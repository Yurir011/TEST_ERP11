from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class MailLog(Base):
    """문서를 메일로 보낸 기록 (참고용). 앱이 보낸 직후 직원이 보고한 값이라 증빙은 메일 서버의 보낸편지함이다.
    본문·첨부는 저장하지 않는다 (받는 사람·제목·누가·언제만)."""

    __tablename__ = "mail_logs"
    __table_args__ = (Index("ix_mail_logs_doc", "doc_type", "doc_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sender_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(30))
    doc_id: Mapped[int] = mapped_column(Integer)
    to_addresses: Mapped[str] = mapped_column(String(1000))
    subject: Mapped[str] = mapped_column(String(255))
