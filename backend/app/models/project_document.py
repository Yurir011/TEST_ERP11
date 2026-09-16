import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User

MAX_ITEMS = 8


class ProjectDocType(str, enum.Enum):
    quotation = "quotation"  # 견적서
    statement = "statement"  # 거래명세서
    tax_invoice = "tax_invoice"  # 세금계산서 (홈택스/팝빌 연동 전까지는 큰 틀만)


class ProjectDocument(Base):
    """문서관리에서 작성하는 견적서/거래명세서/세금계산서.
    프로젝트 상세 화면의 SalesDocument(품목별 PDF 발행)과는 별개로,
    추후 엑셀 자동 입력 및 홈택스/팝빌 연동을 염두에 둔 단순 입력 기록이다.
    """

    __tablename__ = "project_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    doc_type: Mapped[ProjectDocType] = mapped_column(Enum(ProjectDocType, name="projectdoctype"), index=True)
    issue_date: Mapped[date] = mapped_column(Date)
    client_name: Mapped[str] = mapped_column(String(200))  # 거래처명
    manager_name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 담당자
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 자동 생성된 엑셀 파일 경로
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship()
    creator: Mapped["User"] = relationship()
    items: Mapped[list["ProjectDocumentItem"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="ProjectDocumentItem.sort_order"
    )


class ProjectDocumentItem(Base):
    """견적서/거래명세서 한 줄(내용/수량/단가/비고). 문서 1건당 최대 MAX_ITEMS개."""

    __tablename__ = "project_document_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("project_documents.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(String(300))  # 내용
    quantity: Mapped[int] = mapped_column(Integer)  # 수량
    unit_price: Mapped[int] = mapped_column(BigInteger)  # 단가
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # 비고
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    document: Mapped["ProjectDocument"] = relationship(back_populates="items")
