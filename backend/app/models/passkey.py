from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class PasskeyCredential(Base):
    """직원이 폰·PC에 등록한 패스키(지문·얼굴 로그인) 하나. 서버에는 공개키만 저장하고, 개인키는 기기 밖으로 나오지 않는다.
    한 직원이 기기마다 하나씩 여러 개 등록할 수 있다. 직원을 지우면 함께 지워진다."""

    __tablename__ = "passkey_credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credential_id: Mapped[bytes] = mapped_column(LargeBinary, unique=True, index=True)  # 기기가 정한 패스키 식별값
    public_key: Mapped[bytes] = mapped_column(LargeBinary)  # 로그인 서명을 확인하는 공개키 (COSE)
    # 서명할 때마다 올라가는 횟수. 복제된 기기를 알아채는 데 쓴다 (값이 올라가지 않으면 거절).
    sign_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    name: Mapped[str] = mapped_column(String(100))  # 직원이 알아보는 이름 (예: 이도현의 iPhone)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()
