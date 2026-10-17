from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class MessengerFavorite(Base):
    """메신저 즐겨찾기: user_id 가 favorite_user_id 를 즐겨찾기했다. 본인만 보는 목록이다(상대는 알 수 없다)."""

    __tablename__ = "messenger_favorites"
    __table_args__ = (CheckConstraint("user_id <> favorite_user_id", name="ck_messenger_favorite_not_self"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    favorite_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserPresence(Base):
    """직원이 직접 고른(또는 출퇴근으로 자동 설정된) 오늘의 상태. status_date 가 오늘이 아니면 무시한다 (다음 날 자동 초기화).
    기록이 없거나 오래된 사람의 상태는 출퇴근·연차 기록으로 계산한다 (services/presence.py)."""

    __tablename__ = "user_presence"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    status_date: Mapped[date] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
