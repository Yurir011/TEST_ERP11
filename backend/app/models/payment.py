import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, String, Text
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


class ProofType(str, enum.Enum):
    """계좌이체 건의 증빙(영수증/세금계산서 등) 발행 종류"""

    tax_invoice = "tax_invoice"  # 세금계산서
    expense_receipt = "expense_receipt"  # 지출증빙영수증
    simple_receipt = "simple_receipt"  # 간이영수증
    other = "other"  # 기타 (자유 입력)


# 입출금 분류(13개). 콤보박스 선택지로 사용 — category 컬럼은 자유 입력 String이지만 이 목록으로 값을 제한한다.
PAYMENT_CATEGORIES = (
    "소모품비",
    "공과금",
    "복리후생비",
    "지급수수료",
    "인건비",
    "차량",
    "제조",
    "외상매출금",
    "미수",
    "외상매입금",
    "선수금",
    "미지급금",
    "기타",
)

# 분류별 세부 항목(콤보박스). 목록에 없는 분류는 항목 선택 없이 분류명 자체가 내용(description)이 된다.
# "기타" 항목이 포함된 분류(인건비/차량)는 기타 선택 시 자유 입력을 허용하므로 별도 검증 없이 통과시킨다.
PAYMENT_CATEGORY_ITEMS: dict[str, tuple[str, ...]] = {
    "인건비": ("급여", "인건비3.3%", "기타"),
    "차량": ("주유비", "유지관리비", "기타"),
    "제조": ("원재료", "부재료", "소모품"),
}


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
    # 등록된 거래처가 아니어서 이름만 직접 입력한 상대방 (client_id 가 없을 때만 쓴다)
    counterparty: Mapped[str | None] = mapped_column(String(200), nullable=True)
    receipt_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 계좌이체 건의 증빙 발행 여부/종류. 계좌이체가 아닌 경우 항상 None.
    proof_type: Mapped[ProofType | None] = mapped_column(Enum(ProofType, name="prooftype"), nullable=True)
    proof_type_detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 법인카드 건의 카드 종류. 법인카드가 아닌 경우 항상 None.
    card_type: Mapped[str | None] = mapped_column(String(40), nullable=True)  # 법인카드 code (payment_accounts.code, kind=card)
    # 법인카드 사용내역은 카드 결제일에 일괄 확정한다. 확정 전(결제예정)에는 card_pending=True이고 월 입출금 집계에서 제외된다.
    # 확정하면 payment_date가 카드 결제일로 바뀌고, 원래 사용일은 card_used_date에 남는다.
    card_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    card_used_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 계좌이체 건의 계좌 종류. 계좌이체가 아닌 경우 항상 None.
    bank_type: Mapped[str | None] = mapped_column(String(40), nullable=True)  # 계좌 code (payment_accounts.code, kind=bank)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 매입매출 한 건의 일부만 수금/지급한 결제. 연결된 매입매출의 paid_amount에 반영되어 있다 (전액 결제는 Transaction.settled_payment_id로 연결).
    # transactions.settled_payment_id 와 서로 참조하는 순환 관계라 테이블을 만든 뒤 외래키를 추가한다(use_alter). 이름은 실제 DB 와 같다.
    partial_transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL", use_alter=True, name="payments_partial_transaction_id_fkey"), nullable=True
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client | None"] = relationship()
    creator: Mapped["User"] = relationship()
