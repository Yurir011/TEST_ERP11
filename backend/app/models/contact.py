from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.client import Client

MAX_PHONES = 2  # 한 사람당 전화번호 최대 개수 (phone, phone2)


class Contact(Base):
    """연락처. 전 직원이 함께 보고 쓰는 주소록으로, 주로 거래처 사람들을 적는다.

    회사는 등록된 거래처(client_id)를 고르거나, 거래처가 아니면 이름만(company_name) 적는다.
    거래처를 지우면 연락처는 남고 회사 연결만 끊어지며, 그때의 거래처명은 company_name 에 남는다.
    거래처 담당자 중 휴대폰 번호가 있는 사람은 거래처를 저장할 때 자동으로 이 표에 들어온다 (services/contact_sync.py).
    """

    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 직책
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone2: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    client: Mapped["Client | None"] = relationship()
