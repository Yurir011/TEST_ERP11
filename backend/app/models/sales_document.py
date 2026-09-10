import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.document_set import DocumentSet
    from app.models.project import Project
    from app.models.user import User


class SalesDocType(str, enum.Enum):
    estimate = "estimate"  # 견적서
    statement = "statement"  # 거래명세서


class SalesDocument(Base):
    __tablename__ = "sales_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    set_id: Mapped[int] = mapped_column(ForeignKey("document_sets.id"), index=True)
    doc_type: Mapped[SalesDocType] = mapped_column(Enum(SalesDocType))
    doc_no: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    issue_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtotal: Mapped[int] = mapped_column(BigInteger)
    vat: Mapped[int] = mapped_column(BigInteger)
    total: Mapped[int] = mapped_column(BigInteger)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship()
    document_set: Mapped["DocumentSet"] = relationship()
    creator: Mapped["User"] = relationship()
    items: Mapped[list["SalesDocumentItem"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="SalesDocumentItem.id"
    )


class SalesDocumentItem(Base):
    __tablename__ = "sales_document_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("sales_documents.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    spec: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(BigInteger)
    amount: Mapped[int] = mapped_column(BigInteger)

    document: Mapped["SalesDocument"] = relationship(back_populates="items")
