"""문서 목록과 세금계산서 목록 엑셀."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.transaction import Transaction, TransactionType
from app.models.user import User, has_menu_permission
from app.schemas.project_document import ProjectDocumentOut
from app.services.tax_invoice_ledger import is_sales_invoice
from app.services.tax_invoice_list_excel import generate_tax_invoice_list_excel

from app.routers.project_documents._common import PREFIX, _DOC_QUERY_OPTIONS, _to_out_list, logger


router = APIRouter(prefix=PREFIX, tags=["project-documents"])


@router.get("", response_model=list[ProjectDocumentOut])
def list_project_documents(
    doc_type: ProjectDocType | None = Query(default=None),
    project_id: int | None = Query(default=None),
    status_filter: ProjectDocumentStatus | None = Query(default=None, alias="status"),
    approver_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS)
    if doc_type is not None:
        query = query.filter(ProjectDocument.doc_type == doc_type)
    if project_id is not None:
        query = query.filter(ProjectDocument.project_id == project_id)
    if status_filter is not None:
        query = query.filter(ProjectDocument.status == status_filter)
    if approver_mine:
        query = query.filter(ProjectDocument.approver_id == current_user.id)
        # 묶음의 거래명세서는 견적서와 한 번에 결재되므로, 내 결재함/대기 건수에는 견적서 쪽만 한 건으로 보여준다.
        query = query.filter(
            ~(ProjectDocument.set_id.isnot(None) & (ProjectDocument.doc_type == ProjectDocType.statement))
        )
    docs = query.order_by(ProjectDocument.issue_date.desc(), ProjectDocument.id.desc()).all()
    return _to_out_list(db, docs)


@router.get("/export/tax-invoices-excel")
def export_tax_invoices_excel(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status_filter: ProjectDocumentStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not has_menu_permission(current_user, "tax_invoice"):
        logger.debug(f"[ProjectDocuments] 세금계산서 엑셀 권한 없음, 접근 거부: user_id={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 조회 권한이 없습니다.")

    query = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS).filter(ProjectDocument.doc_type == ProjectDocType.tax_invoice)
    if date_from is not None:
        query = query.filter(ProjectDocument.issue_date >= date_from)
    if date_to is not None:
        query = query.filter(ProjectDocument.issue_date <= date_to)
    if status_filter is not None:
        query = query.filter(ProjectDocument.status == status_filter)
    docs = query.order_by(ProjectDocument.issue_date.desc(), ProjectDocument.id.desc()).all()

    billing_docs = [d for d in docs if is_sales_invoice(d)]
    receipt_docs = [d for d in docs if not is_sales_invoice(d)]

    # 개요 탭의 매입 합계: 매입매출관리(Transactions)에 기록된 매입 거래 중 세금계산서번호가 입력된 건만 집계한다.
    purchase_query = db.query(
        sa_func.coalesce(sa_func.sum(Transaction.total_amount), 0), sa_func.count(Transaction.id)
    ).filter(
        Transaction.type == TransactionType.purchase,
        Transaction.tax_invoice_no.isnot(None),
        Transaction.tax_invoice_no != "",
    )
    if date_from is not None:
        purchase_query = purchase_query.filter(Transaction.transaction_date >= date_from)
    if date_to is not None:
        purchase_query = purchase_query.filter(Transaction.transaction_date <= date_to)
    purchase_total, purchase_count = purchase_query.first()

    period_label = f"{date_from.isoformat() if date_from else '처음'} ~ {date_to.isoformat() if date_to else '지금'}"
    logger.debug(
        f"[ProjectDocuments] 세금계산서 엑셀 내보내기: count={len(docs)}, date_from={date_from}, date_to={date_to}, "
        f"status={status_filter}, by={current_user.id}"
    )
    excel_bytes = generate_tax_invoice_list_excel(billing_docs, receipt_docs, int(purchase_total), int(purchase_count), period_label)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
