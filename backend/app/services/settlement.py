"""입출금 결제가 거래처 잔액·매입매출 상태에 미치는 영향을 한곳에서 처리한다.

라우터(`routers/payments.py`)는 HTTP 입출력만 맡고, "결제 하나가 장부에 어떤 변화를 만드는가"는 이 모듈이 맡는다.
결제는 세 가지 중 하나로 반영된다.

1. 매입매출 한 건의 **전액 결제**: 그 건이 결제완료(settled)가 되고, 외상으로 쌓였던 거래처 잔액을 되돌린다.
2. 매입매출 한 건의 **부분 결제**: 건의 paid_amount 가 늘고 거래처 잔액이 그만큼 준다. 건은 외상으로 남는다.
3. **거래처 잔액만 줄이는 정산**: 매입매출과 연결 없이 분류(외상매출금/미지급금 등)만으로 거래처 잔액을 직접 가감한다.

호출 규칙: 이 모듈은 commit 하지 않는다 (호출한 라우터가 한 트랜잭션으로 commit).
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client
from app.models.payment import Payment, PaymentType
from app.models.transaction import Transaction
from app.services.transaction_credit import credit_add, credit_reduce, credit_remove, credit_restore, remaining_amount

logger = get_logger("Settlement")

# 미수금(외상매출금) 수금 / 미지급금 지급 정산 처리 시, 거래처의 잔액을 자동으로 갱신하기 위한 매핑.
# 이 분류/구분 조합에 해당하는 결제만 거래처 잔액에 영향을 준다 (그 외 일반 입출금은 잔액에 영향 없음).
SETTLEMENT_RECEIVABLE_CATEGORY = "외상매출금"
SETTLEMENT_PAYABLE_CATEGORIES = ("외상매입금", "미지급금")


def settlement_field(payment_type: PaymentType, category: str) -> str | None:
    """잔액을 가감할 거래처 필드 이름. 정산 대상이 아닌 결제면 None."""
    if payment_type == PaymentType.deposit and category == SETTLEMENT_RECEIVABLE_CATEGORY:
        return "receivable_amount"
    if payment_type == PaymentType.withdrawal and category in SETTLEMENT_PAYABLE_CATEGORIES:
        return "payable_amount"
    return None


_BALANCE_LABELS = {"receivable_amount": "미수금", "payable_amount": "미지급금"}


def ensure_within_balance(client: Client, field: str, amount: int, returning: int = 0) -> None:
    """거래처 잔액보다 큰 금액은 잔액 정산으로 처리할 수 없다 (400).

    예전에는 잔액보다 많이 입력하면 0에서 멈추고, 그 결제를 지우면 입력 금액 전체가 되살아나 잔액이 실제보다 커졌다.
    그 어긋남을 막기 위해 처음부터 잔액 이내만 받는다.
    returning: 수정하는 경우 되돌려질 기존 금액(같은 거래처·같은 잔액일 때). 잔액을 바꾸기 전에 검사하려고 따로 받는다.
    """
    balance = (getattr(client, field) or 0) + returning
    if amount > balance:
        label = _BALANCE_LABELS.get(field, "잔액")
        logger.debug(f"[Settlement] 잔액 초과 정산 거절: client_id={client.id}, {field}={balance}, amount={amount}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{client.name}의 {label} 잔액(₩{balance:,})보다 큰 금액은 {label} 처리할 수 없습니다. 금액이나 분류를 확인해주세요.",
        )


def apply_balance_settlement(client: Client, field: str, amount: int) -> None:
    """거래처 잔액을 amount 만큼 줄인다. 잔액이 음수가 되지 않도록 0에서 멈춘다."""
    current = getattr(client, field)
    new_value = max(0, current - amount)
    logger.debug(f"[Settlement] 거래처 {field} 자동 차감: client_id={client.id}, {current} -> {new_value}")
    setattr(client, field, new_value)


def revert_balance_settlement(client: Client, field: str, amount: int) -> None:
    """apply_balance_settlement 로 줄였던 잔액을 amount 만큼 되돌린다."""
    current = getattr(client, field)
    logger.debug(f"[Settlement] 거래처 {field} 자동 복원: client_id={client.id}, {current} -> {current + amount}")
    setattr(client, field, current + amount)


def is_partial_payment(tx: Transaction | None, amount: int) -> bool:
    """연결한 매입매출의 미결제 금액보다 적게 수금/지급하면 전액 결제가 아니라 부분 결제다."""
    return tx is not None and 0 < amount < remaining_amount(tx)


def apply_transaction_payment(db: Session, payment: Payment, tx: Transaction, partial: bool) -> None:
    """추가된 payment 가 매입매출 tx 를 결제한 결과를 반영한다 (partial=True 면 부분 결제)."""
    db.flush()  # payment.id 확보
    if partial:
        tx.paid_amount = (tx.paid_amount or 0) + payment.amount
        credit_reduce(db, tx, payment.amount)
        logger.debug(
            f"[Settlement] 매입매출 부분 결제: tx_id={tx.id}, payment_id={payment.id}, amount={payment.amount}, "
            f"paid={tx.paid_amount}/{tx.total_amount}"
        )
        return
    credit_remove(db, tx)  # 외상 상태일 때 거래처 잔액에 반영했던 금액을 되돌린다 (settled 변경 전에 호출해야 한다).
    tx.settled = True
    tx.settled_date = payment.payment_date
    tx.settled_payment_id = payment.id
    logger.debug(f"[Settlement] 매입매출 결제완료 처리: tx_id={tx.id}, payment_id={payment.id}, date={payment.payment_date}")


def resettle_on_update(
    db: Session,
    payment: Payment,
    linked_tx: Transaction | None,
    *,
    new_type: PaymentType,
    new_category: str,
    new_client_id: int | None,
    new_amount: int,
) -> None:
    """결제를 수정할 때 거래처 잔액 정산을 다시 맞춘다: 기존 정산을 되돌리고 새 내용으로 다시 반영한다.

    매입매출과 연결된 결제(전액·부분)는 그 매입매출이 잔액을 관리하므로 건너뛴다.
    새 금액이 잔액 이내인지는 잔액을 바꾸기 전에 먼저 검사한다(같은 거래처·같은 잔액이면 되돌려질 기존 금액까지 감안).
    새 거래처가 없으면 400. payment 의 필드 값은 바꾸지 않는다(호출한 쪽이 갱신).
    """
    # 기존 내역이 정산(미수금 수금/미지급금 지급) 처리였다면, 거래처 잔액에 반영했던 금액을 먼저 되돌린다.
    # (매입매출 내역과 연결된 결제는 그 내역이 잔액을 관리하므로 건너뛴다.)
    is_partial_row = payment.partial_transaction_id is not None  # 부분 결제의 거래처 잔액은 매입매출 쪽에서 관리한다.
    old_settlement_field = None if (linked_tx is not None or is_partial_row) else settlement_field(payment.type, payment.category)
    new_settlement_field = None if (linked_tx is not None or is_partial_row) else settlement_field(new_type, new_category)

    # 잔액을 바꾸기 전에 새 금액이 잔액 이내인지 먼저 검사한다 (같은 거래처·같은 잔액이면 기존 금액이 되돌려지는 것까지 감안).
    if new_settlement_field is not None and new_client_id is not None:
        target = db.query(Client).filter(Client.id == new_client_id).first()
        if target is not None:
            returning = payment.amount if (payment.client_id == target.id and old_settlement_field == new_settlement_field) else 0
            ensure_within_balance(target, new_settlement_field, new_amount, returning=returning)

    if payment.client is not None and old_settlement_field is not None:
        revert_balance_settlement(payment.client, old_settlement_field, payment.amount)

    client = None
    if new_client_id is not None:
        client = db.query(Client).filter(Client.id == new_client_id).first()
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")

    if client is not None and new_settlement_field is not None:
        apply_balance_settlement(client, new_settlement_field, new_amount)


def undo_payment_effects(db: Session, payment: Payment) -> None:
    """결제를 삭제하기 전에 그 결제가 만들었던 장부 변화(거래처 잔액·매입매출 상태)를 되돌린다.

    완납된 매입매출의 분할 결제는 마지막 결제부터 지워야 하므로 400 으로 막는다.
    """
    full_tx = db.query(Transaction).filter(Transaction.settled_payment_id == payment.id).first()
    partial_tx = (
        db.query(Transaction).filter(Transaction.id == payment.partial_transaction_id).first()
        if payment.partial_transaction_id is not None
        else None
    )
    if partial_tx is not None:
        if partial_tx.settled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이미 전액 결제완료된 매입매출의 분할 수금/지급 내역입니다. 마지막에 결제한 내역부터 삭제해주세요.",
            )
        partial_tx.paid_amount = max(0, (partial_tx.paid_amount or 0) - payment.amount)
        credit_restore(db, partial_tx, payment.amount)
        logger.debug(f"[Settlement] 부분 결제 삭제로 미결제 금액 복원: tx_id={partial_tx.id}, amount={payment.amount}")
    elif full_tx is not None:
        full_tx.settled = False
        full_tx.settled_date = None
        full_tx.settled_payment_id = None
        credit_add(db, full_tx)
        logger.debug(f"[Settlement] 입출금 삭제로 매입매출을 외상으로 복원: tx_id={full_tx.id}")
    else:
        field = settlement_field(payment.type, payment.category)
        if payment.client is not None and field is not None:
            revert_balance_settlement(payment.client, field, payment.amount)
