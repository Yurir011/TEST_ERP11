import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.user import User


class TransactionType(str, enum.Enum):
    sales = "sales"  # 매출
    purchase = "purchase"  # 매입


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), index=True)
    transaction_date: Mapped[date] = mapped_column(Date, index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(200), nullable=True)
    item_name: Mapped[str] = mapped_column(String(200))
    supply_amount: Mapped[int] = mapped_column(BigInteger)
    vat_amount: Mapped[int] = mapped_column(BigInteger)
    total_amount: Mapped[int] = mapped_column(BigInteger)
    tax_invoice_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 외상 상태. settled=False면 아직 대금을 주고받지 않은 외상매출/외상매입이고, 입출금관리에서 이 거래를 불러 입금/출금 처리하면
    # 결제완료(settled=True)가 되며 완료일(settled_date)과 연결된 입출금(settled_payment_id)이 기록된다.
    settled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    settled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    settled_payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client | None"] = relationship()
    creator: Mapped["User"] = relationship()
