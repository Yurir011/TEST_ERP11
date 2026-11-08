from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class DeviceToken(Base):
    """모바일 앱(아이폰 등)의 푸시 토큰(FCM). 한 직원이 폰·태블릿 여러 대를 쓸 수 있어 직원당 여러 개를 허용한다.

    토큰은 기기마다 하나라 unique 이다. 같은 폰에서 다른 계정으로 로그인하면 기존 행의 user_id 를 새 계정으로 바꿔
    이전 계정의 알림이 이 폰으로 가지 않게 한다.
    """

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # 이 폰의 주인
    token: Mapped[str] = mapped_column(String(512), unique=True)  # FCM 토큰
    platform: Mapped[str] = mapped_column(String(10))  # ios / android
    device_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())  # 앱이 토큰을 마지막으로 등록한 시각
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
