"""구매 품의서의 발주·입고 진행 → 매입매출관리의 매입 한 건 + 입출금관리의 출금(결제한 경우).

발주 완료(발송 확인)가 되면 그 품의서의 매입(외상 매입)이 만들어지고, 대금 결제 상태에 따라 입출금이 따라온다.
  - 외상(입금·법인카드를 고르지 않음): 매입은 미결제(외상매입)로 남고 거래처 미지급금에 잡힌다. 입출금은 없다.
  - 입금(계좌 지정) / 법인카드(카드 지정): 같은 금액의 출금이 입출금관리에 생기고 매입이 결제완료가 된다.
결제 상태는 발주 완료 때, 입고 완료 때 확인하며 나중에 바꿀 수도 있다. 바꾸면 만들어 둔 출금을 지우고(또는 새로 만들고) 매입의 결제 상태를 맞춘다.
발송 확인을 취소하면 이 매입과 자동으로 만든 출금을 함께 지운다.
입출금관리에서 사람이 직접 연결한 결제가 있으면 그 매입은 건드리지 않는다.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client
from app.models.payment import Payment, PaymentMethod, PaymentType
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.proposal import Proposal
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.money import line_amount, vat_amount
from app.services.payment_accounts import display_name
from app.services.settlement import apply_transaction_payment, undo_payment_effects
from app.services.transaction_credit import credit_add, credit_remove

logger = get_logger("PurchaseLedger")

# 켜져 있으면 발주·입고·결제 상태가 바뀔 때 매입매출·입출금에 자동으로 반영한다.
LEDGER_SYNC_ENABLED = True

LEDGER_CATEGORY = "외상매입금"  # 입출금 분류: 매입(외상 매입)의 대금 지급


def payment_note(db: Session, p: Proposal) -> str:
    if p.payment_method == "deposit":
        return f"입금({display_name(db, 'bank', p.payment_bank) or '계좌 미선택'})"
    if p.payment_method == "card":
        return f"법인카드({display_name(db, 'card', p.payment_card) or '카드 미선택'})"
    return "외상"


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


def _manual_payments(db: Session, tx: Transaction, auto_payment_id: int | None) -> int:
    """입출금관리에서 사람이 이 매입에 직접 연결한 결제(전액·부분) 수. 자동으로 만든 출금은 세지 않는다."""
    query = db.query(Payment).filter((Payment.partial_transaction_id == tx.id) | (Payment.id == tx.settled_payment_id))
    if auto_payment_id is not None:
        query = query.filter(Payment.id != auto_payment_id)
    return query.count()


def _drop_auto_payment(db: Session, p: Proposal) -> None:
    """자동으로 만든 출금을 지우고 매입을 외상 상태로 되돌린다."""
    if p.payment_id is None:
        return
    payment = db.get(Payment, p.payment_id)
    p.payment_id = None
    if payment is not None:
        undo_payment_effects(db, payment)
        db.delete(payment)
        db.flush()
        logger.debug(f"[PurchaseLedger] 자동 출금 삭제: proposal_id={p.id}, payment_id={payment.id}")


def _payment_matches(payment: Payment, p: Proposal, amount: int, client_id: int | None) -> bool:
    if payment.amount != amount or payment.client_id != client_id:
        return False
    if p.payment_method == "deposit":
        return payment.method == PaymentMethod.bank_transfer and payment.bank_type == p.payment_bank
    if p.payment_method == "card":
        return payment.method == PaymentMethod.corporate_card and payment.card_type == p.payment_card
    return False


def sync_purchase_transaction(db: Session, p: Proposal, actor: User) -> Transaction | None:
    """발주 진행 상태에 맞춰 품의서의 매입·출금을 만들거나 고치거나 지운다 (commit 은 호출한 쪽에서)."""
    if not LEDGER_SYNC_ENABLED:
        return None
    tx = db.query(Transaction).filter(Transaction.proposal_id == p.id).first()

    if p.order_sent_at is None:
        if tx is not None and _manual_payments(db, tx, p.payment_id) == 0:
            _drop_auto_payment(db, p)
            credit_remove(db, tx)
            db.delete(tx)
            logger.debug(f"[PurchaseLedger] 발주 취소로 매입 삭제: proposal_id={p.id}, tx_id={tx.id}")
        return None

    if p.currency != "KRW":
        logger.debug(f"[PurchaseLedger] 원화가 아닌 품의서는 매입 자동 등록 생략: proposal_id={p.id}, currency={p.currency}")
        return None

    supply, party = _supply_and_party(db, p)
    vat = vat_amount(supply)
    total = supply + vat
    client = db.query(Client).filter(Client.name == party).first() if party else None
    memo = f"구매 품의서 No. {p.doc_no} · {payment_note(db, p)}"

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
        db.flush()
    elif _manual_payments(db, tx, p.payment_id) > 0:
        logger.debug(f"[PurchaseLedger] 입출금관리에서 직접 결제한 매입은 건드리지 않음: proposal_id={p.id}, tx_id={tx.id}")
        return tx

    existing = db.get(Payment, p.payment_id) if p.payment_id is not None else None
    wanted = p.payment_method in ("deposit", "card")
    # 결제 상태나 금액이 바뀌었으면 만들어 둔 출금을 먼저 지우고 매입을 외상으로 되돌린 뒤 다시 맞춘다.
    if existing is not None and not (wanted and _payment_matches(existing, p, total, client.id if client else None)):
        _drop_auto_payment(db, p)
        existing = None

    if not tx.settled:
        credit_remove(db, tx)
    tx.client_id = client.id if client else None
    tx.counterparty = party
    tx.supply_amount = supply
    tx.vat_amount = vat
    tx.total_amount = total
    tx.memo = memo
    if not tx.settled:
        credit_add(db, tx)
    db.flush()

    if wanted and existing is None and not tx.settled:
        payment = Payment(
            type=PaymentType.withdrawal,
            payment_date=date.today(),
            category=LEDGER_CATEGORY,
            description=f"{p.title} (구매 품의서 {p.doc_no})"[:300],
            amount=total,
            method=PaymentMethod.bank_transfer if p.payment_method == "deposit" else PaymentMethod.corporate_card,
            client_id=client.id if client else None,
            memo=memo,
            bank_type=p.payment_bank if p.payment_method == "deposit" else None,
            card_type=p.payment_card if p.payment_method == "card" else None,
            card_pending=False,
            created_by=actor.id,
        )
        db.add(payment)
        apply_transaction_payment(db, payment, tx, partial=False)
        p.payment_id = payment.id
        logger.debug(f"[PurchaseLedger] 출금 자동 등록: proposal_id={p.id}, payment_id={payment.id}, amount={total}, {payment_note(db, p)}")

    logger.debug(f"[PurchaseLedger] 매입 반영: proposal_id={p.id}, tx_id={tx.id}, total={tx.total_amount}, 결제={payment_note(db, p)}")
    return tx
