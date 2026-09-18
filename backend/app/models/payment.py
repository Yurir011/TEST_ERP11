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


class ProofType(str, enum.Enum):
    """계좌이체 건의 증빙(영수증/세금계산서 등) 발행 종류"""

    tax_invoice = "tax_invoice"  # 세금계산서
    expense_receipt = "expense_receipt"  # 지출증빙영수증
    simple_receipt = "simple_receipt"  # 간이영수증
    other = "other"  # 기타 (자유 입력)


class CardType(str, enum.Enum):
    """법인카드 건의 카드 종류"""

    bc = "bc"  # BC카드
    kb_kookmin = "kb_kookmin"  # KB국민카드


class BankType(str, enum.Enum):
    """계좌이체 건의 계좌 종류"""

    ibk = "ibk"  # 기업은행
    kb_kookmin = "kb_kookmin"  # KB국민은행
    woori = "woori"  # 우리은행


# 입출금 분류(12개). 콤보박스 선택지로 사용 — category 컬럼은 자유 입력 String이지만 이 목록으로 값을 제한한다.
PAYMENT_CATEGORIES = (
    "소모품비",
    "공과금",
    "복리후생비",
    "지급수수료",
    "인건비",
    "차량",
    "제조",
    "외상매출금",
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
    receipt_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 계좌이체 건의 증빙 발행 여부/종류. 계좌이체가 아닌 경우 항상 None.
    proof_type: Mapped[ProofType | None] = mapped_column(Enum(ProofType, name="prooftype"), nullable=True)
    proof_type_detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 법인카드 건의 카드 종류. 법인카드가 아닌 경우 항상 None.
    card_type: Mapped[CardType | None] = mapped_column(Enum(CardType, name="cardtype"), nullable=True)
    # 계좌이체 건의 계좌 종류. 계좌이체가 아닌 경우 항상 None.
    bank_type: Mapped[BankType | None] = mapped_column(Enum(BankType, name="banktype"), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client | None"] = relationship()
    creator: Mapped["User"] = relationship()
