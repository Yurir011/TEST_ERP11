import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class DeviceStatus(str, enum.Enum):
    pending = "pending"  # 앱이 등록을 요청했고 관리자 승인을 기다리는 중
    approved = "approved"  # 승인됨: 이 PC 에서 카드 로그인을 받는다
    revoked = "revoked"  # 사용 중지 (분실·교체)


class ClientDevice(Base):
    """데스크톱 앱이 설치된 PC. 앱이 처음 실행될 때 만든 서명 키의 공개키(Ed25519, 32바이트 16진수)로 구분한다.
    관리자가 승인한 PC 에서만 카드 로그인을 받는다 (카드 번호는 복제될 수 있어서)."""

    __tablename__ = "client_devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    public_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20), default=DeviceStatus.pending.value, index=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
