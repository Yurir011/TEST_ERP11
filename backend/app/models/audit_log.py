from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AuditLog(Base):
    """감사 로그(변경 이력). 돈·권한·삭제·로그인 관련 변경을 "누가, 언제, 무엇을, 어떻게" 남긴다.

    기록은 app/core/audit.py 가 DB 쓰기 시점에 자동으로 남긴다 (로그인 이벤트만 직접 기록).
    이 테이블은 수정·삭제 API 를 두지 않는다 (기록의 신뢰성).
    """

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    # 누가: 계정이 지워져도 읽을 수 있게 당시 이름을 함께 저장한다. 서버 밖 스크립트는 user_id 없이 "시스템(스크립트명)".
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request: Mapped[str | None] = mapped_column(String(200), nullable=True)  # 예: "POST /api/payments"
    action: Mapped[str] = mapped_column(String(30))  # create / update / delete / login_success / login_failed / login_blocked
    entity_type: Mapped[str] = mapped_column(String(50))  # 예: client, payment, transaction, user
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {필드: [전, 후]}
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # 사람이 읽는 한 줄 설명
