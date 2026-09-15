from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    biz_reg_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ceo_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bank_account: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    receivable_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    payable_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    creator: Mapped["User"] = relationship()
    contacts: Mapped[list["ClientContact"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientContact.sort_order"
    )


class ClientContact(Base):
    """거래처 담당자. 담당자가 여러 명인 경우가 있어 거래처 1:N 관계로 관리한다."""

    __tablename__ = "client_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 직책
    landline_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 유선전화
    mobile_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 휴대폰
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    client: Mapped["Client"] = relationship(back_populates="contacts")
