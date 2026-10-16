"""외상 매출/매입이 거래처 미수금(receivable_amount)/미지급금(payable_amount)에 미치는 영향을 한곳에서 관리한다.

매입매출 내역이 외상(settled=False)이면 아직 받지(주지) 못한 금액(total_amount - paid_amount)만큼 거래처 잔액이 늘어 있고,
결제완료가 되거나 삭제/수정되면 되돌린다. 일부만 수금/지급하면 그만큼 paid_amount가 늘고 거래처 잔액이 줄어든다.
호출 순서: 내역을 바꾸기 전에 credit_remove, 바꾼 뒤에 credit_add.
"""
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client
from app.models.transaction import Transaction, TransactionType

logger = get_logger("TransactionCredit")


def _field(tx: Transaction) -> str:
    return "receivable_amount" if tx.type == TransactionType.sales else "payable_amount"


def remaining_amount(tx: Transaction) -> int:
    """아직 결제되지 않은 금액."""
    return max(0, tx.total_amount - (tx.paid_amount or 0))


def credit_add(db: Session, tx: Transaction) -> None:
    if tx.client_id is None or tx.settled:
        return
    client = db.get(Client, tx.client_id)
    if client is None:
        return
    field = _field(tx)
    current = getattr(client, field) or 0
    amount = remaining_amount(tx)
    setattr(client, field, current + amount)
    logger.debug(f"[TransactionCredit] {field} 증가: client_id={client.id}, {current} -> {current + amount} (tx_id={tx.id})")


def credit_remove(db: Session, tx: Transaction) -> None:
    if tx.client_id is None or tx.settled:
        return
    client = db.get(Client, tx.client_id)
    if client is None:
        return
    field = _field(tx)
    current = getattr(client, field) or 0
    new_value = max(0, current - remaining_amount(tx))
    setattr(client, field, new_value)
    logger.debug(f"[TransactionCredit] {field} 감소: client_id={client.id}, {current} -> {new_value} (tx_id={tx.id})")


def credit_reduce(db: Session, tx: Transaction, amount: int) -> None:
    """부분 수금/지급한 만큼 거래처 잔액만 줄인다 (paid_amount는 호출하는 쪽에서 바꾼다)."""
    if tx.client_id is None:
        return
    client = db.get(Client, tx.client_id)
    if client is None:
        return
    field = _field(tx)
    current = getattr(client, field) or 0
    setattr(client, field, max(0, current - amount))
    logger.debug(f"[TransactionCredit] {field} 부분 감소: client_id={client.id}, {current} -> {max(0, current - amount)} (tx_id={tx.id}, amount={amount})")


def credit_restore(db: Session, tx: Transaction, amount: int) -> None:
    """부분 수금/지급을 취소한 만큼 거래처 잔액을 다시 늘린다."""
    if tx.client_id is None:
        return
    client = db.get(Client, tx.client_id)
    if client is None:
        return
    field = _field(tx)
    current = getattr(client, field) or 0
    setattr(client, field, current + amount)
    logger.debug(f"[TransactionCredit] {field} 부분 복원: client_id={client.id}, {current} -> {current + amount} (tx_id={tx.id}, amount={amount})")
