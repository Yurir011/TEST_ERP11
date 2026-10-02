import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text
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


class ProjectDocumentStatus(str, enum.Enum):
    draft = "draft"  # 작성 중 (결재 요청 전, 수정 가능)
    pending = "pending"  # 결재 요청됨, 승인 대기 중
    approved = "approved"  # 결재 승인 완료 - PDF/엑셀에 직인 날인됨, 저장/발송/출력 가능
    rejected = "rejected"  # 반려됨 - 재수정 후 재요청 가능


class DocCurrency(str, enum.Enum):
    KRW = "KRW"  # 원
    USD = "USD"  # 달러
    JPY = "JPY"  # 엔


DOC_CURRENCY_SYMBOLS: dict[DocCurrency, str] = {
    DocCurrency.KRW: "₩",
    DocCurrency.USD: "$",
    DocCurrency.JPY: "¥",
}


class TaxInvoicePurpose(str, enum.Enum):
    billing = "청구"  # 대금 입금 전, 청구용으로 발행
    receipt = "영수"  # 대금 입금 후, 영수증 대용으로 발행


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
    doc_no: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 견적번호 (MMDD-NN, 당일 발행 순번). 견적서/거래명세서만 사용
    currency: Mapped[str] = mapped_column(String(3), default=DocCurrency.KRW.value)  # 금액 단위 (KRW/USD/JPY)
    purpose_type: Mapped[str] = mapped_column(String(10), default=TaxInvoicePurpose.billing.value)  # 청구/영수 (세금계산서만 사용)
    client_name: Mapped[str] = mapped_column(String(200))  # 거래처명
    manager_name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # 담당자
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 자동 생성된 PDF 파일 경로
    excel_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 승인 시 함께 생성되는 엑셀 파일 경로
    status: Mapped[ProjectDocumentStatus] = mapped_column(
        Enum(ProjectDocumentStatus, name="projectdocumentstatus"), default=ProjectDocumentStatus.draft
    )
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # 현재(또는 마지막) 결재 처리 대상자
    current_step: Mapped[int] = mapped_column(Integer, default=1)  # 다단계 결재선에서 현재 대기 중인 단계 (1부터 시작)
    is_final_decision: Mapped[bool] = mapped_column(Boolean, default=False)  # 전결 여부 (결재선 없이 본인 결재로 즉시 완료)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 견적서+거래명세서를 한 번에 작성한 묶음 식별자 (묶음의 견적서 id). 묶음은 한 번의 결재로 함께 승인/반려된다. 단독 문서는 None.
    set_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # 세금계산서 팝빌 발행 상태 (승인 완료 후에만 발행 가능). 발행되면 팝빌 서버가 원본을 보관한다.
    popbill_mgt_key: Mapped[str | None] = mapped_column(String(24), nullable=True)
    popbill_nts_confirm_num: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 국세청 승인번호
    popbill_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 세금계산서 전용: 결재 승인 즉시(팝빌 발행 여부와 무관하게) 매입매출관리에 자동 생성되는 거래 내역 연결.
    ledger_transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"), nullable=True)
    # 입출금관리에 입금/지급 확인 결과가 기록되었는지 여부 (confirm-payment 엔드포인트가 1회만 실행되도록 보장).
    payment_recorded: Mapped[bool] = mapped_column(Boolean, default=False)
    # 작성(또는 반려 후 재요청) 시점에 미리 물어본 입금(청구)/지급(영수) 확인 여부. 결재가 바로 나지 않고
    # 대기 상태로 남더라도, 실제 승인되는 시점에 이 값을 그대로 사용해 입출금관리에 기록한다.
    payment_received_hint: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    project: Mapped["Project"] = relationship()
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    approver: Mapped["User | None"] = relationship(foreign_keys=[approver_id])
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
