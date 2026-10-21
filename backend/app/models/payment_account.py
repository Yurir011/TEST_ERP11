from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base

ACCOUNT_KINDS = ("card", "bank")  # 법인카드 / 계좌


class PaymentAccount(Base):
    """입출금에서 고르는 법인카드·계좌 목록. 관리자가 추가·수정·삭제한다.

    입출금(payments.card_type / bank_type)·정기 지출·품의서 결제에는 이 표의 code 가 저장된다.
    처음부터 있던 BC·KB국민 카드와 기업·국민·우리 계좌는 옛 값(bc, kb_kookmin, ibk, woori)을 code 로 그대로 쓴다.
    사용 내역이 있는 수단은 지우지 않고 숨긴다(is_active=False).
    """

    __tablename__ = "payment_accounts"
    __table_args__ = (UniqueConstraint("kind", "code", name="uq_payment_accounts_kind_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), index=True)  # card / bank
    code: Mapped[str] = mapped_column(String(40))  # 입출금에 저장되는 값
    nickname: Mapped[str] = mapped_column(String(50))  # 화면에 평소 보이는 이름(별명)
    issuer: Mapped[str] = mapped_column(String(50))  # 카드사 / 은행
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)  # 카드번호·계좌번호 뒤 4자리 (눌러서 확인)
    pay_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 카드 결제일 (매월 N일). 계좌는 비움
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
