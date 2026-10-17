from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class NfcCard(Base):
    """직원에게 등록한 NFC 카드. 카드 번호(UID)는 그대로 저장하지 않고 서버 비밀키로 만든 HMAC 값만 저장한다
    (DB 가 유출돼도 카드 번호를 알 수 없다). 화면에 보여 줄 끝 4자리만 따로 둔다."""

    __tablename__ = "nfc_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    uid_hmac: Mapped[str] = mapped_column(String(64), unique=True)  # 카드 한 장은 한 직원에게만 등록된다
    uid_last4: Mapped[str] = mapped_column(String(4))
    label: Mapped[str] = mapped_column(String(50), default="")  # 예: "사원증"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    registered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
