"""세금계산서 ↔ 매입매출·입출금 장부 연동.

세금계산서가 결재 승인되면 팝빌 발행 여부와 무관하게 매입매출관리에 자동 기록한다. 승인된 세금계산서를 수정해
다시 승인받으면 이미 기록된 내역(과 대금 결제가 끝난 건의 입출금 내역)을 새 내용으로 고친다. commit 은 호출한 쪽이 한다.
"""
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.payment import Payment, PaymentType
from app.models.project_document import ProjectDocType, ProjectDocument, calc_amount
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.money import vat_amount
from app.services.transaction_credit import credit_add, credit_remove

logger = get_logger("ProjectDocuments")


def is_sales_invoice(doc: ProjectDocument) -> bool:
    """세금계산서가 매출(우리가 발행)인지 여부. 받은 세금계산서 등록으로 direction이 정해진 문서는 그 값을,
    그 외(직접 작성)는 작성목적(청구→매출, 영수→매입)으로 판단한다."""
    if doc.direction:
        return doc.direction == "sales"
    return doc.purpose_type == "청구"


def record_tax_invoice_transaction(db: Session, doc: ProjectDocument, current_user: User) -> None:
    """세금계산서가 결재 승인되면 팝빌 발행 여부와 무관하게 즉시 매입매출관리에 자동 기록한다.
    청구 목적은 매출, 영수 목적은 매입으로 집계한다. doc.project는 호출 전에 반드시 로드되어 있어야 한다."""
    if doc.doc_type != ProjectDocType.tax_invoice:
        return

    subtotal = sum(calc_amount(item.quantity, item.unit_price) for item in doc.items)
    vat = vat_amount(subtotal)
    tx_type = TransactionType.sales if is_sales_invoice(doc) else TransactionType.purchase

    existing = db.get(Transaction, doc.ledger_transaction_id) if doc.ledger_transaction_id is not None else None
    if doc.ledger_transaction_id is not None:
        # 승인된 세금계산서를 수정해 다시 승인받은 경우: 이미 기록된 매입매출 내역을 새 내용으로 고친다.
        # 대금 결제(입금/출금)가 끝난 내역도 결제 상태와 연결된 입출금은 그대로 두고 금액/거래처 등만 고친다.
        if existing is None:
            doc.ledger_transaction_id = None
        else:
            credit_remove(db, existing)
            existing.type = tx_type
            existing.transaction_date = doc.issue_date
            existing.client_id = doc.effective_client.id if doc.effective_client else None
            existing.counterparty = doc.client_name
            existing.supply_amount = subtotal
            existing.vat_amount = vat
            existing.total_amount = subtotal + vat
            credit_add(db, existing)
            logger.debug(
                f"[ProjectDocuments] 수정된 세금계산서 재승인 → 매입매출 내역 갱신: doc_id={doc.id}, tx_id={existing.id}, "
                f"settled={existing.settled}, amount={existing.total_amount}"
            )
            # 대금 결제가 끝난 건이면 연결된 입출금 내역(금액/거래처/입금·출금 구분)도 같은 내용으로 맞춘다. 결제일/방법/메모는 그대로 둔다.
            payment = db.get(Payment, existing.settled_payment_id) if existing.settled_payment_id is not None else None
            if payment is not None:
                payment.amount = existing.total_amount
                payment.client_id = existing.client_id
                payment.type = PaymentType.deposit if tx_type == TransactionType.sales else PaymentType.withdrawal
                logger.debug(
                    f"[ProjectDocuments] 수정된 세금계산서 재승인 → 입출금 내역 갱신: doc_id={doc.id}, payment_id={payment.id}, "
                    f"amount={payment.amount}, type={payment.type.value}"
                )
            return
    tx = Transaction(
        type=tx_type,
        transaction_date=doc.issue_date,
        client_id=doc.effective_client.id if doc.effective_client else None,
        counterparty=doc.client_name,
        item_name=f"세금계산서 ({doc.doc_no or doc.id})",
        supply_amount=subtotal,
        vat_amount=vat,
        total_amount=subtotal + vat,
        tax_invoice_no=doc.doc_no or doc.approval_no,
        memo=f"[자동연동] 세금계산서 승인(project_document_id={doc.id})에서 자동 생성됨",
        settled=False,  # 세금계산서는 항상 외상으로 기록하고, 실제 입금/출금은 입출금관리에서 처리한다.
        created_by=current_user.id,
    )
    db.add(tx)
    db.flush()
    credit_add(db, tx)
    doc.ledger_transaction_id = tx.id
    logger.debug(
        f"[ProjectDocuments] 세금계산서 매입매출 자동 기록: doc_id={doc.id}, tx_id={tx.id}, "
        f"type={tx_type.value}, amount={tx.total_amount}"
    )
