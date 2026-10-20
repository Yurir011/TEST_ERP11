"""구매 품의서의 발주·입고 진행: 발송 확인과 입고 확인 (사용자가 직접 눌러 확인한다)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.proposal import PURCHASE_KIND, Proposal, ProposalStatus
from app.models.user import User, is_admin_role
from app.routers.proposals._common import PREFIX, _get_or_404, _to_out, logger
from app.schemas.proposal import OrderFlowToggle, OrderPaymentIn, ProposalOut
from app.services.purchase_ledger import sync_purchase_transaction

router = APIRouter(prefix=PREFIX, tags=["proposals"])


def _check_actor_and_kind(p: Proposal, current_user: User) -> None:
    if p.kind != PURCHASE_KIND:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="구매 품의서에서만 사용할 수 있습니다.")
    if p.created_by != current_user.id and not is_admin_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자 또는 관리자만 처리할 수 있습니다.")
    if p.status != ProposalStatus.approved or p.delete_requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 구매 품의서만 처리할 수 있습니다.")


@router.put("/{proposal_id}/order-sent", response_model=ProposalOut)
def set_order_sent(
    proposal_id: int, payload: OrderFlowToggle, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """발주서를 거래처에 보냈음을 확인한다. 승인된 발주서가 1건 이상 있어야 하고(온라인 주문은 online=true 로 발주서 없이 발주 완료 처리),
    입고 확인 후에는 취소할 수 없다."""
    p = _get_or_404(db, proposal_id)
    _check_actor_and_kind(p, current_user)
    logger.debug(f"[Proposals] 발송 확인 변경 시도: id={proposal_id}, sent={payload.value}, by={current_user.id}")
    if payload.value:
        approved_orders = (
            db.query(ProjectDocument)
            .filter(
                ProjectDocument.proposal_id == proposal_id,
                ProjectDocument.doc_type == ProjectDocType.purchase_order,
                ProjectDocument.status == ProjectDocumentStatus.approved,
            )
            .count()
        )
        if approved_orders == 0 and not payload.online:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재가 승인된 발주서가 있어야 발송 확인을 할 수 있습니다.")
        p.order_sent_at = p.order_sent_at or datetime.now(timezone.utc)
        p.order_sent_by = p.order_sent_by or current_user.id
        # 발주 완료 때 고른 결제 방법 (처음 발주 완료할 때만 받는다. 고르지 않으면 미입금)
        if p.payment_method is None:
            if payload.payment_method == "card" and payload.payment_card is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="법인카드는 카드를 골라야 합니다.")
            p.payment_method = payload.payment_method
            p.payment_card = payload.payment_card if payload.payment_method == "card" else None
    else:
        if p.received_at is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="입고 확인을 먼저 취소해야 합니다.")
        p.order_sent_at = None
        p.order_sent_by = None
        p.payment_method = None
        p.payment_card = None
    sync_purchase_transaction(db, p, current_user)  # 매입매출관리의 매입 반영 (발송 확인 → 매입 등록, 취소 → 삭제)
    db.commit()
    return _to_out(_get_or_404(db, proposal_id))


@router.put("/{proposal_id}/order-payment", response_model=ProposalOut)
def set_order_payment(
    proposal_id: int, payload: OrderPaymentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """발주 완료된 건의 결제 상태를 바꾼다: 입금 / 법인카드(카드 종류) / 미입금. 매입매출관리의 매입도 함께 바뀐다."""
    p = _get_or_404(db, proposal_id)
    _check_actor_and_kind(p, current_user)
    if p.order_sent_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="발주 완료 후에 결제 상태를 정할 수 있습니다.")
    if payload.payment_method == "card" and payload.payment_card is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="법인카드는 카드를 골라야 합니다.")
    p.payment_method = payload.payment_method
    p.payment_card = payload.payment_card if payload.payment_method == "card" else None
    logger.debug(f"[Proposals] 결제 상태 변경: id={proposal_id}, method={p.payment_method}, card={p.payment_card}, by={current_user.id}")
    sync_purchase_transaction(db, p, current_user)
    db.commit()
    return _to_out(_get_or_404(db, proposal_id))


@router.put("/{proposal_id}/received", response_model=ProposalOut)
def set_received(
    proposal_id: int, payload: OrderFlowToggle, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """입고(물품 수령)를 확인한다. 발송 확인이 끝난 뒤에만 할 수 있다."""
    p = _get_or_404(db, proposal_id)
    _check_actor_and_kind(p, current_user)
    logger.debug(f"[Proposals] 입고 확인 변경 시도: id={proposal_id}, received={payload.value}, by={current_user.id}")
    if payload.value:
        if p.order_sent_at is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="발주서 발송 확인 후에 입고 처리를 할 수 있습니다.")
        p.received_at = p.received_at or datetime.now(timezone.utc)
        p.received_by = p.received_by or current_user.id
    else:
        p.received_at = None
        p.received_by = None
    db.commit()
    return _to_out(_get_or_404(db, proposal_id))
