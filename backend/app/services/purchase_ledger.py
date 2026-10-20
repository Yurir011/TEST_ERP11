"""구매 품의서의 발주 진행 → 매입매출관리의 매입 한 건.

발주 완료(발송 확인)가 되면 그 품의서의 매입이 만들어지고, 발주 완료 때 고른 결제 방법에 따라 결제 상태가 정해진다.
  - 입금 / 법인카드: 결제완료(settled=True)
  - 아무것도 고르지 않음: 미입금(외상매입, settled=False) — 거래처 미지급금에 잡힌다.
발송 확인을 취소하면 이 매입도 지운다(이미 입출금으로 결제한 내역이 있으면 지우지 않고 그대로 둔다).
"""
from datetime import date

from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client
from app.models.payment import Payment
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.proposal import Proposal
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.money import line_amount, vat_amount
from app.services.transaction_credit import credit_add, credit_remove

logger = get_logger("PurchaseLedger")

# 매입매출관리 연동은 나중에 다시 정리하기로 해서 꺼 둔다. 켜면 발주 완료 때 매입이 자동으로 만들어진다.
LEDGER_SYNC_ENABLED = False

CARD_LABELS = {"bc": "BC카드", "kb_kookmin": "KB국민카드"}


def payment_note(p: Proposal) -> str:
    if p.payment_method == "deposit":
        return "입금"
    if p.payment_method == "card":
        return f"법인카드({CARD_LABELS.get(p.payment_card or '', '카드 미선택')})"
    return "미입금"


def _supply_and_party(db: Session, p: Proposal) -> tuple[int, str | None]:
    """공급가액과 거래처명: 승인된 발주서가 있으면 발주서 합계, 없으면(온라인 주문) 품의서에 적은 금액."""
    orders = (
        db.query(ProjectDocument)
        .filter(
            ProjectDocument.proposal_id == p.id,
            ProjectDocument.doc_type == ProjectDocType.purchase_order,
            ProjectDocument.status == ProjectDocumentStatus.approved,
        )
        .all()
    )
    if orders:
        supply = sum(line_amount(it.quantity, it.unit_price) for o in orders for it in o.items)
        return supply, orders[0].client_name
    return (round(float(p.amount)) if p.amount is not None else 0), p.vendor_name


def _has_real_payments(db: Session, tx: Transaction) -> bool:
    """입출금관리에서 이 매입을 결제(전액·부분)한 내역이 있는가."""
    if tx.id is None:
        return False
    return (
        db.query(Payment)
        .filter((Payment.partial_transaction_id == tx.id) | (Payment.id == tx.settled_payment_id))
        .count()
        > 0
    )


def sync_purchase_transaction(db: Session, p: Proposal, actor: User) -> Transaction | None:
    """발주 진행 상태에 맞춰 품의서의 매입 내역을 만들거나 고치거나 지운다 (commit 은 호출한 쪽에서)."""
    if not LEDGER_SYNC_ENABLED:
        return None
    tx = db.query(Transaction).filter(Transaction.proposal_id == p.id).first()

    if p.order_sent_at is None:
        if tx is not None and not _has_real_payments(db, tx):
            credit_remove(db, tx)
            db.delete(tx)
            logger.debug(f"[PurchaseLedger] 발주 취소로 매입 삭제: proposal_id={p.id}, tx_id={tx.id}")
        return None

    if p.currency != "KRW":
        logger.debug(f"[PurchaseLedger] 원화가 아닌 품의서는 매입 자동 등록 생략: proposal_id={p.id}, currency={p.currency}")
        return None

    supply, party = _supply_and_party(db, p)
    vat = vat_amount(supply)
    client = db.query(Client).filter(Client.name == party).first() if party else None
    settled = p.payment_method in ("deposit", "card")
    memo = f"구매 품의서 No. {p.doc_no} · {payment_note(p)}"

    if tx is None:
        tx = Transaction(
            type=TransactionType.purchase,
            transaction_date=p.order_sent_at.date() if p.order_sent_at else date.today(),
            item_name=p.title[:200],
            supply_amount=0,
            vat_amount=0,
            total_amount=0,
            proposal_id=p.id,
            created_by=actor.id,
        )
        db.add(tx)
    else:
        credit_remove(db, tx)

    tx.client_id = client.id if client else None
    tx.counterparty = party
    tx.supply_amount = supply
    tx.vat_amount = vat
    tx.total_amount = supply + vat
    tx.memo = memo
    # 입출금관리에서 이미 결제 처리한 건은 결제 상태를 건드리지 않는다.
    if not _has_real_payments(db, tx):
        tx.settled = settled
        tx.settled_date = (tx.settled_date or date.today()) if settled else None
        tx.paid_amount = tx.total_amount if settled else 0
    db.flush()
    credit_add(db, tx)
    logger.debug(f"[PurchaseLedger] 매입 반영: proposal_id={p.id}, tx_id={tx.id}, total={tx.total_amount}, 결제={payment_note(p)}")
    return tx
