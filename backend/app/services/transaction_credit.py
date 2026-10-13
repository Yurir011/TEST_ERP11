"""외상 매출/매입이 거래처 미수금(receivable_amount)/미지급금(payable_amount)에 미치는 영향을 한곳에서 관리한다.

매입매출 내역이 외상(settled=False)이면 그 합계금액만큼 거래처 잔액이 늘어 있고, 결제완료가 되거나 삭제/수정되면 되돌린다.
호출 순서: 내역을 바꾸기 전에 credit_remove, 바꾼 뒤에 credit_add.
"""
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client
from app.models.transaction import Transaction, TransactionType

logger = get_logger("TransactionCredit")


def _field(tx: Transaction) -> str:
    return "receivable_amount" if tx.type == TransactionType.sales else "payable_amount"


def credit_add(db: Session, tx: Transaction) -> None:
    if tx.client_id is None or tx.settled:
        return
    client = db.get(Client, tx.client_id)
    if client is None:
        return
    field = _field(tx)
    current = getattr(client, field) or 0
    setattr(client, field, current + tx.total_amount)
    logger.debug(f"[TransactionCredit] {field} 증가: client_id={client.id}, {current} -> {current + tx.total_amount} (tx_id={tx.id})")


def credit_remove(db: Session, tx: Transaction) -> None:
    if tx.client_id is None or tx.settled:
        return
    client = db.get(Client, tx.client_id)
    if client is None:
        return
    field = _field(tx)
    current = getattr(client, field) or 0
    new_value = max(0, current - tx.total_amount)
    setattr(client, field, new_value)
    logger.debug(f"[TransactionCredit] {field} 감소: client_id={client.id}, {current} -> {new_value} (tx_id={tx.id})")
