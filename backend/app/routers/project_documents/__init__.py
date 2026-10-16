"""문서관리(견적서·거래명세서·세금계산서·발주서) API. 하위 모듈의 라우터를 하나로 합쳐 `router` 로 내보낸다.

경로는 모두 /api/project-documents 로 시작한다. 결재(요청·승인·반려·삭제 결재)는 이 파일에 있다.
"""
from datetime import datetime, timezone
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.approval import advance_chain_self_approvals, approve_current_step, build_chain_steps, get_steps, reject_current_step, validate_chain_approvers
from app.core.deps import get_current_user
from app.database import get_db
from app.models.approval_step import ApprovalStep, ApprovalStepStatus
from app.models.payment import Payment
from app.models.project_document import ProjectDocument, ProjectDocumentStatus
from app.models.transaction import Transaction
from app.models.user import JobTitle, User, is_admin_role
from app.schemas.project_document import ApprovalRequestIn, ProjectDocumentOut, RejectIn
from app.services import project_document_files as doc_files
from app.services.approval_notice import create_decision_notification, create_request_notification
from app.services.tax_invoice_ledger import record_tax_invoice_transaction
from app.services.transaction_credit import credit_remove

from app.routers.project_documents import crud, files, images, listing, popbill
from app.routers.project_documents._common import DOC_TYPE_LABELS_KO, PREFIX, _TARGET, _apply_approval_request, _delete_label, _doc_link, _get_doc_or_404, _set_siblings, _to_out, logger


router = APIRouter()
_approval_router = APIRouter(prefix=PREFIX, tags=["project-documents"])


@_approval_router.post("/{doc_id}/request-approval", response_model=ProjectDocumentOut)
def request_approval(
    doc_id: int, payload: ApprovalRequestIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 결재를 요청할 수 있습니다.")
    if doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작성 중이거나 반려된 문서만 결재 요청할 수 있습니다.")
    steps = _apply_approval_request(db, doc, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user)
    # 묶음이면 나머지 문서도 같은 결재선으로 다시 요청한다 (알림은 한 번만).
    siblings = [s for s in _set_siblings(db, doc) if s.status in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected)]
    for sibling in siblings:
        _apply_approval_request(db, sibling, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user, notify=False)
    db.commit()

    for target in siblings:
        refreshed = _get_doc_or_404(db, target.id)
        doc_files.regenerate_documents(db, refreshed)
        db.commit()
    doc = _get_doc_or_404(db, doc.id)
    doc_files.regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc, steps)


def _delete_document_now(db: Session, doc: ProjectDocument) -> None:
    """문서를 실제로 지운다. 승인 때 자동 기록된 매입매출 내역과, 대금 결제가 끝난 건의 입출금 내역도 함께 지우고
    거래처 미수금/미지급금을 되돌린다 (commit은 호출자가)."""
    if doc.ledger_transaction_id is not None:
        tx = db.get(Transaction, doc.ledger_transaction_id)
        doc.ledger_transaction_id = None
        db.flush()
        if tx is not None:
            credit_remove(db, tx)
            payment = db.get(Payment, tx.settled_payment_id) if tx.settled_payment_id is not None else None
            db.delete(tx)
            logger.debug(f"[ProjectDocuments] 삭제: 연결된 매입매출 내역 삭제 tx_id={tx.id}, doc_id={doc.id}")
            if payment is not None:
                # 대금 결제가 끝난 건이면 연결된 입출금 내역(과 첨부 영수증)도 함께 삭제한다.
                db.flush()
                if payment.receipt_path and os.path.exists(payment.receipt_path):
                    os.remove(payment.receipt_path)
                db.delete(payment)
                logger.debug(f"[ProjectDocuments] 삭제: 연결된 입출금 내역 삭제 payment_id={payment.id}, doc_id={doc.id}")
    for image in doc.images:
        if os.path.exists(image.file_path):
            os.remove(image.file_path)
    for path in (doc.file_path, doc.excel_path):
        if path and os.path.exists(path):
            os.remove(path)
    db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == doc.id).delete()
    db.delete(doc)
    logger.debug(f"[ProjectDocuments] 문서 삭제 완료: doc_id={doc.id}")


def _restore_after_delete_rejected(db: Session, doc: ProjectDocument) -> None:
    """삭제 결재가 반려되면 삭제 요청 전의 승인 상태(결재선 포함)로 되돌린다."""
    snap = doc.delete_prev_steps or {}
    db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == doc.id).delete()
    for st in snap.get("steps", []):
        db.add(
            ApprovalStep(
                target_type=_TARGET,
                target_id=doc.id,
                step_order=st["step_order"],
                title=JobTitle(st["title"]),
                approver_id=st["approver_id"],
                status=ApprovalStepStatus(st["status"]),
                decided_at=datetime.fromisoformat(st["decided_at"]) if st.get("decided_at") else None,
            )
        )
    doc.status = ProjectDocumentStatus.approved
    doc.approver_id = snap.get("approver_id")
    doc.current_step = snap.get("current_step", 1)
    doc.is_final_decision = snap.get("is_final_decision", False)
    doc.reviewed_at = datetime.fromisoformat(snap["reviewed_at"]) if snap.get("reviewed_at") else None
    doc.reject_reason = None
    doc.delete_requested = False
    doc.delete_prev_steps = None


@_approval_router.post("/{doc_id}/request-delete", response_model=ProjectDocumentOut)
def request_delete_document(
    doc_id: int, payload: ApprovalRequestIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """승인된 문서(견적서/거래명세서/발주서/세금계산서)의 삭제를 결재 요청한다. 결재가 최종 승인되면 삭제되고, 반려되면 그대로 유지된다."""
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id and not is_admin_role(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자 또는 관리자만 삭제 결재를 요청할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.approved or doc.delete_requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서만 삭제 결재를 요청할 수 있습니다.")

    # 결재선 검증은 이전 상태를 건드리기 전에 한다 (잘못된 요청이면 문서가 바뀌지 않도록).
    chain = approvers = None
    if not payload.is_final_decision:
        chain, approvers = validate_chain_approvers(db, payload.end_title, payload.approver_ids)

    old_steps = get_steps(db, _TARGET, doc.id)
    doc.delete_prev_steps = {
        "steps": [
            {
                "step_order": st.step_order,
                "title": st.title.value,
                "approver_id": st.approver_id,
                "status": st.status.value,
                "decided_at": st.decided_at.isoformat() if st.decided_at else None,
            }
            for st in old_steps
        ],
        "approver_id": doc.approver_id,
        "current_step": doc.current_step,
        "is_final_decision": doc.is_final_decision,
        "reviewed_at": doc.reviewed_at.isoformat() if doc.reviewed_at else None,
    }
    doc.delete_requested = True
    db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == doc.id).delete()
    logger.debug(f"[ProjectDocuments] 삭제 결재 요청: doc_id={doc_id}, by={current_user.id}, final={payload.is_final_decision}")

    if payload.is_final_decision:
        steps: list[ApprovalStep] = []
        fully_approved = True
    else:
        steps = build_chain_steps(db, _TARGET, doc.id, chain, approvers)
        fully_approved = advance_chain_self_approvals(steps, current_user)

    if fully_approved:
        out = _to_out(doc, steps)
        _delete_document_now(db, doc)
        db.commit()
        logger.debug(f"[ProjectDocuments] 삭제 결재 전결/자기결재로 즉시 삭제: doc_id={doc_id}")
        return out

    pending_step = next(s for s in steps if s.status == ApprovalStepStatus.pending)
    doc.status = ProjectDocumentStatus.pending
    doc.current_step = pending_step.step_order
    doc.approver_id = pending_step.approver_id
    doc.reviewed_at = None
    create_request_notification(
        db, target_user_id=pending_step.approver_id, requester_name=current_user.name, doc_label=_delete_label(doc), link=_doc_link(doc.doc_type, doc.id)
    )
    db.commit()
    doc = _get_doc_or_404(db, doc_id)
    doc_files.regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc, steps)


def _approve_one(db: Session, doc: ProjectDocument, current_user: User, notify: bool) -> bool:
    """문서 1건의 현재 결재 단계를 승인하고, 마지막 단계면 승인 완료, 아니면 다음 결재권자로 넘긴다 (commit은 호출자가).
    삭제 결재의 마지막 단계를 승인한 경우에는 상태를 바꾸지 않고 True(지금 삭제해야 함)를 돌려준다."""
    steps = get_steps(db, _TARGET, doc.id)
    next_step = approve_current_step(steps, doc.current_step)
    doc_label = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})"

    if next_step is None and doc.delete_requested:
        return True
    if next_step is None:
        doc.status = ProjectDocumentStatus.approved
        doc.reviewed_at = datetime.now(timezone.utc)
        record_tax_invoice_transaction(db, doc, current_user)
        if notify:
            create_decision_notification(
                db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=doc_label, approved=True, link=_doc_link(doc.doc_type, doc.id)
            )
    else:
        doc.current_step = next_step.step_order
        doc.approver_id = next_step.approver_id
        if notify:
            create_request_notification(
                db, target_user_id=next_step.approver_id, requester_name=doc.creator.name,
                doc_label=_delete_label(doc) if doc.delete_requested else doc_label, link=_doc_link(doc.doc_type, doc.id)
            )
            logger.debug(f"[ProjectDocuments] 다음 결재 요청 알림 발송: doc_id={doc.id}, approver_id={next_step.approver_id}")
    return False


@_approval_router.put("/{doc_id}/approve", response_model=ProjectDocumentOut)
def approve_project_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 승인할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 승인할 수 있습니다.")

    logger.debug(f"[ProjectDocuments] 결재 승인 시도: id={doc_id}, by={current_user.id}")
    if _approve_one(db, doc, current_user, notify=True):
        # 삭제 결재가 최종 승인됨: 문서와 연결된 매입매출 내역을 지우고 요청자에게 알린다.
        out = _to_out(doc, get_steps(db, _TARGET, doc.id)).model_copy(update={"status": ProjectDocumentStatus.approved})
        create_decision_notification(
            db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=_delete_label(doc), approved=True
        )
        _delete_document_now(db, doc)
        db.commit()
        logger.debug(f"[ProjectDocuments] 삭제 결재 최종 승인 → 삭제 완료: id={doc_id}, by={current_user.id}")
        return out
    # 견적서+거래명세서 묶음이면 한 번의 승인으로 나머지 문서도 같은 단계까지 함께 승인한다 (알림은 중복 발송하지 않는다).
    siblings = [s for s in _set_siblings(db, doc) if s.status == ProjectDocumentStatus.pending and s.approver_id == current_user.id]
    for sibling in siblings:
        _approve_one(db, sibling, current_user, notify=False)
        logger.debug(f"[ProjectDocuments] 묶음 문서 함께 승인: doc_id={sibling.id}, set_id={doc.set_id}")
    db.commit()

    for target in [doc, *siblings]:
        refreshed = _get_doc_or_404(db, target.id)
        doc_files.regenerate_documents(db, refreshed)
        db.commit()
    doc = _get_doc_or_404(db, doc.id)
    logger.debug(f"[ProjectDocuments] 결재 승인 완료: id={doc_id}, by={current_user.id}")
    return _to_out(doc, get_steps(db, _TARGET, doc.id))


def _reject_one(db: Session, doc: ProjectDocument, reason: str, notify: bool) -> None:
    steps = get_steps(db, _TARGET, doc.id)
    reject_current_step(steps, doc.current_step)

    doc.status = ProjectDocumentStatus.rejected
    doc.reject_reason = reason
    doc.reviewed_at = datetime.now(timezone.utc)
    if notify:
        create_decision_notification(
            db,
            target_name=doc.creator.name,
            target_user_id=doc.created_by,
            doc_label=f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})",
            approved=False,
            detail=f"반려 사유: {reason}",
            link=_doc_link(doc.doc_type, doc.id),
        )


@_approval_router.put("/{doc_id}/reject", response_model=ProjectDocumentOut)
def reject_project_document(
    doc_id: int, payload: RejectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 반려할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 반려할 수 있습니다.")

    if doc.delete_requested:
        # 삭제 결재 반려: 문서는 삭제 요청 전의 승인 상태로 되돌아간다.
        create_decision_notification(
            db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=_delete_label(doc), approved=False,
            detail=f"반려 사유: {payload.reason}", link=_doc_link(doc.doc_type, doc.id),
        )
        _restore_after_delete_rejected(db, doc)
        db.commit()
        doc = _get_doc_or_404(db, doc_id)
        doc_files.regenerate_documents(db, doc)
        db.commit()
        logger.debug(f"[ProjectDocuments] 삭제 결재 반려 → 승인 상태 복원: id={doc_id}, by={current_user.id}, reason={payload.reason}")
        return _to_out(doc, get_steps(db, _TARGET, doc.id))

    _reject_one(db, doc, payload.reason, notify=True)
    # 묶음이면 나머지 문서도 함께 반려한다 (알림은 한 번만).
    siblings = [s for s in _set_siblings(db, doc) if s.status == ProjectDocumentStatus.pending and s.approver_id == current_user.id]
    for sibling in siblings:
        _reject_one(db, sibling, payload.reason, notify=False)
        logger.debug(f"[ProjectDocuments] 묶음 문서 함께 반려: doc_id={sibling.id}, set_id={doc.set_id}")
    db.commit()

    for target in [doc, *siblings]:
        refreshed = _get_doc_or_404(db, target.id)
        doc_files.regenerate_documents(db, refreshed)
        db.commit()
    doc = _get_doc_or_404(db, doc.id)
    logger.debug(f"[ProjectDocuments] 결재 반려: id={doc_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(doc, get_steps(db, _TARGET, doc.id))


# 하위 라우터를 원래 선언 순서에 가깝게 포함한다 (고정 경로는 /{doc_id} 계열과 겹치지 않는다).
router.include_router(listing.router)
router.include_router(images.router)
router.include_router(crud.router)
router.include_router(_approval_router)
router.include_router(files.router)
router.include_router(popbill.router)
