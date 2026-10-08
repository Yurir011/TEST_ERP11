from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.payment import BankType, PaymentType

if TYPE_CHECKING:
    from app.models.user import User


class RecurringPayment(Base):
    """매달 정해진 날짜에 자동이체되는 항목. 활성 상태이면 해당 월의 입출금 내역이 자동으로 기록된다."""

    __tablename__ = "recurring_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[PaymentType] = mapped_column(Enum(PaymentType, name="paymenttype"), default=PaymentType.withdrawal)
    category: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(300))
    amount: Mapped[int] = mapped_column(BigInteger)
    day_of_month: Mapped[int] = mapped_column(Integer)  # 1~31 (해당 월에 없는 날짜는 말일로 처리)
    start_month: Mapped[date] = mapped_column(Date)  # 첫 자동이체 월 (해당 월 1일로 저장)
    bank_type: Mapped[BankType] = mapped_column(Enum(BankType, name="banktype"))
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator: Mapped["User"] = relationship()
    runs: Mapped[list["RecurringPaymentRun"]] = relationship(back_populates="recurring", cascade="all, delete-orphan")


class RecurringPaymentRun(Base):
    """어느 월분을 이미 입출금 내역으로 기록했는지 남기는 이력. 기록된 내역을 사용자가 지워도 같은 월분이 다시 생기지 않게 한다."""

    __tablename__ = "recurring_payment_runs"
    __table_args__ = (UniqueConstraint("recurring_id", "year_month", name="uq_recurring_run_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    recurring_id: Mapped[int] = mapped_column(ForeignKey("recurring_payments.id", ondelete="CASCADE"), index=True)
    year_month: Mapped[str] = mapped_column(String(7))  # "2026-10"
    payment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    recurring: Mapped["RecurringPayment"] = relationship(back_populates="runs")
