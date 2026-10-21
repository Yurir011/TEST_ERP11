"""법인카드·계좌 목록(payment_accounts) 조회·검증 도우미."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.payment import Payment
from app.models.payment_account import PaymentAccount
from app.models.proposal import Proposal
from app.models.recurring_payment import RecurringPayment

KIND_LABELS = {"card": "카드", "bank": "계좌"}


def list_accounts(db: Session, kind: str | None = None, active_only: bool = True) -> list[PaymentAccount]:
    query = db.query(PaymentAccount)
    if kind is not None:
        query = query.filter(PaymentAccount.kind == kind)
    if active_only:
        query = query.filter(PaymentAccount.is_active.is_(True))
    return query.order_by(PaymentAccount.kind, PaymentAccount.sort_order, PaymentAccount.id).all()


def get_account(db: Session, kind: str, code: str | None) -> PaymentAccount | None:
    if not code:
        return None
    return db.query(PaymentAccount).filter(PaymentAccount.kind == kind, PaymentAccount.code == code).first()


def require_account(db: Session, kind: str, code: str | None, *, must_be_active: bool = True) -> PaymentAccount:
    """입출금·정기 지출 등에서 고른 카드/계좌 code 가 있는 수단인지 확인한다. 없거나(숨김 포함) 잘못이면 400."""
    account = get_account(db, kind, code)
    if account is None or (must_be_active and not account.is_active):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"등록되지 않은 {KIND_LABELS.get(kind, '결제수단')}입니다. 카드·계좌 관리에서 먼저 추가해주세요.")
    return account


def display_name(db: Session, kind: str, code: str | None) -> str:
    """화면·전표에 보이는 이름(별명). 목록에 없으면 code 를 그대로 쓴다."""
    account = get_account(db, kind, code)
    return account.nickname if account else (code or "")


def card_pay_day(db: Session, code: str) -> int:
    """카드 결제일 (매월 N일). 지정하지 않은 카드는 설정값(BC 23일 / 그 밖 15일)을 쓴다."""
    account = get_account(db, "card", code)
    if account is not None and account.pay_day:
        return account.pay_day
    return settings.card_bc_pay_day if code == "bc" else settings.card_kb_pay_day


def usage_count(db: Session, account: PaymentAccount) -> int:
    """이 카드/계좌를 쓴 입출금·정기 지출·품의서 수 (하나라도 있으면 지우지 않고 숨긴다)."""
    if account.kind == "card":
        return (
            db.query(Payment).filter(Payment.card_type == account.code).count()
            + db.query(Proposal).filter(Proposal.payment_card == account.code).count()
        )
    return (
        db.query(Payment).filter(Payment.bank_type == account.code).count()
        + db.query(RecurringPayment).filter(RecurringPayment.bank_type == account.code).count()
        + db.query(Proposal).filter(Proposal.payment_bank == account.code).count()
    )
