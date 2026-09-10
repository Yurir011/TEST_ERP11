import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.user import User


class PaymentType(str, enum.Enum):
    deposit = "deposit"  # 입금
    withdrawal = "withdrawal"  # 출금


class PaymentMethod(str, enum.Enum):
    corporate_card = "corporate_card"  # 법인카드
    cash = "cash"  # 현금
    bank_transfer = "bank_transfer"  # 계좌이체
    other = "other"  # 기타


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[PaymentType] = mapped_column(Enum(PaymentType), index=True)
    payment_date: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(300))
    amount: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), default=PaymentMethod.other)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    receipt_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client | None"] = relationship()
    creator: Mapped["User"] = relationship()
