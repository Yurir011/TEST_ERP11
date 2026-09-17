from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class TodoItem(Base):
    __tablename__ = "todo_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(String(300))
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    # 완료 처리된 날짜. 이 날짜가 오늘이 아니면 목록 조회 시 제외되어 "다음날 자동 숨김"을 구현한다.
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 할 일 추가 시 오늘 날짜로 자동 생성되는 일정관리 이벤트와 연결 (토글/삭제 시 함께 동기화하기 위함)
    schedule_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("schedule_events.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()
