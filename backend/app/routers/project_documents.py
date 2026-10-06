import os
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.approval import advance_chain_self_approvals, build_chain_steps, get_steps, get_steps_map, validate_chain_approvers
from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import (
    ProjectDocType,
    ProjectDocument,
    ProjectDocumentImage,
    ProjectDocumentItem,
    ProjectDocumentStatus,
    calc_amount,
)
from app.models.payment import Payment, PaymentMethod, PaymentType
from app.models.transaction import Transaction, TransactionType
from app.models.user import JobTitle, User, has_menu_permission
from app.schemas.approval import to_approval_step_out
from app.schemas.project_document import (
    ApprovalRequestIn,
    PopbillIssueOut,
    ProjectDocumentCreate,
    ProjectDocumentOut,
    TaxInvoiceOcrOut,
    TaxInvoiceOcrItemOut,
    TaxInvoicePartyOut,
    ProjectDocumentSetCreate,
    ProjectDocumentUpdate,
    RejectIn,
    TaxInvoicePaymentConfirm,
)
from app.services.approval_notice import create_decision_notification, create_request_notification
from app.services.excel_to_pdf import convert_xlsx_to_pdf
from app.services import popbill_service
from app.services.project_document_excel import generate_project_document_excel
from app.services.project_document_pdf import generate_project_document_pdf
from app.services.project_document_template import fill_project_document_template, next_doc_no
from app.services.tax_invoice_list_excel import generate_tax_invoice_list_excel
from app.services.tax_invoice_ocr import recognize_tax_invoice
from popbill import PopbillException

TEMPLATED_DOC_TYPES = (ProjectDocType.quotation, ProjectDocType.statement, ProjectDocType.tax_invoice)

router = APIRouter(prefix="/api/project-documents", tags=["project-documents"])
logger = get_logger("ProjectDocuments")
_TARGET = ApprovalTargetType.project_document

DOC_TYPE_LABELS_KO = {
    ProjectDocType.quotation: "견적서",
    ProjectDocType.statement: "거래명세서",
    ProjectDocType.tax_invoice: "세금계산서",
}

def _doc_link(doc_type: ProjectDocType, doc_id: int) -> str:
    base = "/tax-invoices" if doc_type == ProjectDocType.tax_invoice else "/project-documents"
    return f"{base}?open={doc_id}"


_DOC_QUERY_OPTIONS = (
    joinedload(ProjectDocument.project).joinedload(Project.client).joinedload(Client.contacts),
    joinedload(ProjectDocument.other_client).joinedload(Client.contacts),
    joinedload(ProjectDocument.items),
    joinedload(ProjectDocument.approver),
    joinedload(ProjectDocument.images),
)


def _first_contact_email(client: Client | None) -> str | None:
    if client is None:
        return None
    if client.email:
        return client.email
    for contact in client.contacts:
        if contact.email:
            return contact.email
    return None


def _to_out(doc: ProjectDocument, steps: list[ApprovalStep]) -> ProjectDocumentOut:
    return ProjectDocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        project_name=doc.project_display_name,
        doc_type=doc.doc_type,
        issue_date=doc.issue_date,
        doc_no=doc.doc_no,
        currency=doc.currency,
        purpose_type=doc.purpose_type,
        client_name=doc.client_name,
        manager_name=doc.manager_name,
        items=doc.items,
        has_pdf=bool(doc.file_path),
        set_id=doc.set_id,
        has_excel=bool(doc.excel_path),
        status=doc.status,
        current_step=doc.current_step,
        steps=[to_approval_step_out(s) for s in steps],
        approver_id=doc.approver_id,
        approver_name=doc.approver.name if doc.approver else None,
        is_final_decision=doc.is_final_decision,
        reviewed_at=doc.reviewed_at,
        reject_reason=doc.reject_reason,
        client_contact_email=_first_contact_email(doc.effective_client),
        created_by=doc.created_by,
        created_at=doc.created_at,
        popbill_issued=bool(doc.popbill_issued_at),
        popbill_nts_confirm_num=doc.popbill_nts_confirm_num,
        popbill_issued_at=doc.popbill_issued_at,
        payment_recorded=doc.payment_recorded,
        direction=doc.direction,
        approval_no=doc.approval_no,
        images=doc.images,
    )


def _to_out_db(db: Session, doc: ProjectDocument) -> ProjectDocumentOut:
    return _to_out(doc, get_steps(db, _TARGET, doc.id))


def _to_out_list(db: Session, docs: list[ProjectDocument]) -> list[ProjectDocumentOut]:
    steps_map = get_steps_map(db, _TARGET, [d.id for d in docs])
    return [_to_out(d, steps_map.get(d.id, [])) for d in docs]


def _get_doc_or_404(db: Session, doc_id: int) -> ProjectDocument:
    doc = db.query(ProjectDocument).options(*_DOC_QUERY_OPTIONS).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    return doc


def _is_sales(doc: ProjectDocument) -> bool:
    """세금계산서가 매출(우리가 발행)인지 여부. 받은 세금계산서 등록으로 direction이 정해진 문서는 그 값을,
    그 외(직접 작성)는 작성목적(청구→매출, 영수→매입)으로 판단한다."""
    if doc.direction:
        return doc.direction == "sales"
    return doc.purpose_type == "청구"


def _record_tax_invoice_transaction(db: Session, doc: ProjectDocument, current_user: User) -> None:
    """세금계산서가 결재 승인되면 팝빌 발행 여부와 무관하게 즉시 매입매출관리에 자동 기록한다.
    청구 목적은 매출, 영수 목적은 매입으로 집계한다. doc.project는 호출 전에 반드시 로드되어 있어야 한다."""
    if doc.doc_type != ProjectDocType.tax_invoice or doc.ledger_transaction_id is not None:
        return

    subtotal = sum(calc_amount(item.quantity, item.unit_price) for item in doc.items)
    vat = round(subtotal * 0.1)
    tx_type = TransactionType.sales if _is_sales(doc) else TransactionType.purchase
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
        created_by=current_user.id,
    )
    db.add(tx)
    db.flush()
    doc.ledger_transaction_id = tx.id
    logger.debug(
        f"[ProjectDocuments] 세금계산서 매입매출 자동 기록: doc_id={doc.id}, tx_id={tx.id}, "
        f"type={tx_type.value}, amount={tx.total_amount}"
    )


def _finalize_tax_invoice_payment(db: Session, doc: ProjectDocument, received: bool, current_user: User) -> None:
    """세금계산서 승인 시점에 확정된 입금(청구)/지급(영수) 여부를 입출금관리에 기록한다.
    미수(청구)/미지급(영수)인 경우 외상매출금/외상매입금으로 남기고 거래처 잔액을 늘려,
    나중에 기존 미수금/미지급금 수금·지급 처리(정산) 화면에서 정상화할 수 있게 한다."""
    if doc.payment_recorded:
        return

    subtotal = sum(calc_amount(item.quantity, item.unit_price) for item in doc.items)
    total = subtotal + round(subtotal * 0.1)
    is_billing = _is_sales(doc)
    payment_type = PaymentType.deposit if is_billing else PaymentType.withdrawal
    category = ("외상매출금" if is_billing else "외상매입금") if not received else "기타"
    action_label = "입금" if is_billing else "지급"
    description = f"세금계산서 {doc.doc_no or doc.id} {action_label}" + ("" if received else " (미확정)")

    client = doc.effective_client
    payment = Payment(
        type=payment_type,
        payment_date=doc.issue_date,
        category=category,
        description=description,
        amount=total,
        method=PaymentMethod.other,
        client_id=client.id if client else None,
        memo=f"[자동연동] 세금계산서 project_document_id={doc.id}",
        created_by=current_user.id,
    )
    db.add(payment)

    if not received and client is not None:
        field = "receivable_amount" if is_billing else "payable_amount"
        current = getattr(client, field)
        setattr(client, field, current + total)
        logger.debug(
            f"[ProjectDocuments] 세금계산서 미확정 처리로 거래처 {field} 자동 증가: "
            f"client_id={client.id}, {current} -> {current + total}"
        )

    doc.payment_recorded = True
    logger.debug(
        f"[ProjectDocuments] 세금계산서 입출금 확인 기록: doc_id={doc.id}, received={received}, "
        f"amount={total}, category={category}, by={current_user.id}"
    )


def _apply_approval_request(
    db: Session,
    doc: ProjectDocument,
    end_title: JobTitle | None,
    approver_ids: list[int],
    is_final_decision: bool,
    current_user: User,
    notify: bool = True,
) -> list[ApprovalStep]:
    """doc.id가 이미 확보된 상태(flush 이후)에서 호출해야 한다. 재요청(반려 후 재작성)인 경우 이전
    결재선은 지우고 새로 만든다."""
    doc.is_final_decision = is_final_decision
    doc.reject_reason = None
    db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == doc.id).delete()
    doc_label = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})"

    if is_final_decision:
        doc.status = ProjectDocumentStatus.approved
        doc.current_step = 1
        doc.approver_id = current_user.id
        doc.reviewed_at = datetime.now(timezone.utc)
        _record_tax_invoice_transaction(db, doc, current_user)
        if doc.doc_type == ProjectDocType.tax_invoice and doc.payment_received_hint is not None:
            _finalize_tax_invoice_payment(db, doc, doc.payment_received_hint, current_user)
        if notify:
            create_decision_notification(
                db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=doc_label, approved=True, link=_doc_link(doc.doc_type, doc.id)
            )
        logger.debug(f"[ProjectDocuments] 전결 처리(즉시 승인): doc_id={doc.id}, by={current_user.id}")
        return []

    chain, approvers = validate_chain_approvers(db, end_title, approver_ids)
    steps = build_chain_steps(db, _TARGET, doc.id, chain, approvers)
    fully_approved = advance_chain_self_approvals(steps, current_user)
    if fully_approved:
        doc.status = ProjectDocumentStatus.approved
        doc.current_step = len(steps)
        doc.approver_id = steps[-1].approver_id
        doc.reviewed_at = datetime.now(timezone.utc)
        _record_tax_invoice_transaction(db, doc, current_user)
        if doc.doc_type == ProjectDocType.tax_invoice and doc.payment_received_hint is not None:
            _finalize_tax_invoice_payment(db, doc, doc.payment_received_hint, current_user)
        if notify:
            create_decision_notification(
                db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=doc_label, approved=True, link=_doc_link(doc.doc_type, doc.id)
            )
        logger.debug(f"[ProjectDocuments] 자기결재 처리(즉시 승인): doc_id={doc.id}, by={current_user.id}")
    else:
        pending_step = next(s for s in steps if s.status == ApprovalStepStatus.pending)
        doc.status = ProjectDocumentStatus.pending
        doc.current_step = pending_step.step_order
        doc.approver_id = pending_step.approver_id
        doc.reviewed_at = None
        if notify:
            create_request_notification(
                db, target_user_id=pending_step.approver_id, requester_name=current_user.name, doc_label=doc_label, link=_doc_link(doc.doc_type, doc.id)
            )
        logger.debug(f"[ProjectDocuments] 결재 요청: doc_id={doc.id}, approver_id={pending_step.approver_id}")
    return steps


def _normalize_company_name(name: str | None) -> str:
    """거래처명 비교용: 공백과 법인 형태 표기(주식회사/(주)/유한회사 등)를 없앤다. OCR이 띄어쓰기를 바꿔 읽어도 같은 거래처로 찾기 위함."""
    return re.sub(r"\s|\(주\)|\(유\)|주식회사|유한회사", "", name or "")


def _find_client(db: Session, name: str, reg_no: str | None = None) -> Client | None:
    """거래처관리에서 사업자번호(우선) 또는 정규화한 이름이 같은 거래처를 찾는다."""
    clients = db.query(Client).all()
    digits = "".join(ch for ch in (reg_no or "") if ch.isdigit())
    if digits:
        for c in clients:
            if "".join(ch for ch in (c.biz_reg_no or "") if ch.isdigit()) == digits:
                return c
    target = _normalize_company_name(name)
    return next((c for c in clients if target and _normalize_company_name(c.name) == target), None)


def _resolve_project(db: Session, payload: ProjectDocumentCreate) -> Project | None:
    """선택한 프로젝트를 조회한다. "기타"(project_id 없음)이면 None을 돌려준다."""
    if payload.project_id is None:
        return None
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 프로젝트입니다.")
    return project


def _new_document(
    db: Session, payload: ProjectDocumentCreate, doc_type: ProjectDocType, project: Project | None, current_user: User
) -> ProjectDocument:
    """문서 1건을 만들고 flush해서 id를 확보한 채로 돌려준다 (결재선 생성 전 단계)."""
    doc = ProjectDocument(
        project_id=payload.project_id,
        project_other_name=payload.project_other_name,
        doc_type=doc_type,
        issue_date=payload.issue_date,
        currency=payload.currency.value,
        purpose_type=payload.purpose_type.value,
        client_name=payload.client_name,
        manager_name=payload.manager_name,
        created_by=current_user.id,
        payment_received_hint=payload.received,
        direction=payload.direction if doc_type == ProjectDocType.tax_invoice else None,
        approval_no=payload.approval_no if doc_type == ProjectDocType.tax_invoice else None,
    )
    if doc_type == ProjectDocType.quotation:
        doc.doc_no = next_doc_no(db, doc_type, payload.issue_date)
    doc.items = [
        ProjectDocumentItem(content=i.content, quantity=i.quantity, unit_price=i.unit_price, note=i.note, sort_order=idx)
        for idx, i in enumerate(payload.items)
    ]
    doc.creator = current_user
    doc.project = project
    snapshot = {k: v for k, v in (payload.counterparty.model_dump() if payload.counterparty else {}).items() if v}
    if doc_type == ProjectDocType.tax_invoice and snapshot:
        doc.counterparty_info = snapshot
    if project is None:
        # "기타": 거래처명이 같은 거래처가 있으면 연결해 대표자/사업자번호/이메일을 문서와 팝빌 발행에 쓴다.
        doc.other_client = _find_client(db, payload.client_name, snapshot.get("reg_no"))
        logger.debug(f"[ProjectDocuments] 기타 프로젝트 문서: other_name={payload.project_other_name}, client_matched={doc.other_client is not None}")
    db.add(doc)
    db.flush()  # id 확보 (ApprovalStep.target_id에 필요)
    return doc


def _set_siblings(db: Session, doc: ProjectDocument) -> list[ProjectDocument]:
    """같은 묶음(견적서+거래명세서)에 속한 다른 문서들. 단독 문서면 빈 리스트."""
    if doc.set_id is None:
        return []
    return (
        db.query(ProjectDocument)
        .options(*_DOC_QUERY_OPTIONS)
        .filter(ProjectDocument.set_id == doc.set_id, ProjectDocument.id != doc.id)
        .all()
    )


def _regenerate_pdf(db: Session, doc: ProjectDocument) -> None:
    pdf_bytes = generate_project_document_pdf(doc, doc.project, doc.effective_client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)
    doc.file_path = file_path
    logger.debug(f"[ProjectDocuments] PDF 생성: doc_id={doc.id}, status={doc.status}, file={file_path}")


def _regenerate_excel(db: Session, doc: ProjectDocument) -> None:
    """승인 완료된 문서만 회계 처리용 엑셀을 함께 생성한다."""
    if doc.status != ProjectDocumentStatus.approved:
        return
    excel_bytes = generate_project_document_excel(doc, doc.project, doc.effective_client)
    os.makedirs(settings.project_documents_dir, exist_ok=True)
    file_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.xlsx")
    with open(file_path, "wb") as f:
        f.write(excel_bytes)
    doc.excel_path = file_path
    logger.debug(f"[ProjectDocuments] 엑셀 생성: doc_id={doc.id}, file={file_path}")


def _regenerate_from_template(doc: ProjectDocument) -> None:
    """견적서/거래명세서: 실제 양식 파일의 빈 칸을 채운 엑셀을 만들고, 그 엑셀을 그대로 PDF로 내보낸다."""
    xlsx_path = fill_project_document_template(doc)
    doc.excel_path = xlsx_path
    pdf_path = os.path.join(settings.project_documents_dir, f"{doc.id}_{doc.doc_type.value}.pdf")
    convert_xlsx_to_pdf(xlsx_path, pdf_path)
    doc.file_path = pdf_path
    logger.debug(f"[ProjectDocuments] 양식 기반 엑셀/PDF 생성 완료: doc_id={doc.id}, excel={xlsx_path}, pdf={pdf_path}")


def _regenerate_documents(db: Session, doc: ProjectDocument) -> None:
    """문서 종류에 맞춰 엑셀/PDF를 다시 만든다. 견적서/거래명세서는 실제 양식을 채우고,
    세금계산서는 기존 방식(빈 워크북에서 직접 그리기)을 그대로 사용한다."""
    if doc.doc_type in TEMPLATED_DOC_TYPES:
        _regenerate_from_template(doc)
    else:
        _regenerate_pdf(db, doc)
        _regenerate_excel(db, doc)


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

    billing_docs = [d for d in docs if _is_sales(d)]
    receipt_docs = [d for d in docs if not _is_sales(d)]

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


ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_IMAGE_SIZE = 15 * 1024 * 1024  # 15MB


def _normalize_company_no(value: str | None) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


@router.post("/ocr/tax-invoice", response_model=TaxInvoiceOcrOut)
def ocr_tax_invoice(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """홈택스 세금계산서 사진에서 내용을 인식해 입력란을 미리 채울 값을 돌려준다 (저장하지 않음).
    공급자/공급받는자 중 우리 회사(설정의 사업자등록번호)가 어느 쪽인지로 매출/매입 방향을 판별한다."""
    if not has_menu_permission(current_user, "tax_invoice"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 작성 권한이 없습니다.")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지 파일(jpg, png, webp)만 업로드할 수 있습니다.")
    raw = file.file.read()
    if len(raw) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="파일 크기는 15MB를 초과할 수 없습니다.")

    logger.debug(f"[ProjectDocuments] 세금계산서 사진 인식 시작: filename={file.filename}, size={len(raw)}, by={current_user.id}")
    try:
        r = recognize_tax_invoice(raw)
    except Exception as exc:  # noqa: BLE001 - 깨진 이미지/OCR 실행 오류 모두 사용자에게는 같은 안내
        logger.error(f"[ProjectDocuments] 세금계산서 사진 인식 실패: {exc}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지를 인식하지 못했습니다. 다른 파일로 시도하거나 직접 입력해주세요.")

    ours = _normalize_company_no(settings.company_reg_no)
    direction = None
    counterparty = None
    if ours and _normalize_company_no(r.supplier.reg_no) == ours:
        direction, counterparty = "sales", r.recipient.name
    elif ours and _normalize_company_no(r.recipient.reg_no) == ours:
        direction, counterparty = "purchase", r.supplier.name
    else:
        r.warnings.append("공급자/공급받는자 중 우리 회사를 확인하지 못해 매입/매출을 판별하지 못했습니다. 거래처명을 직접 확인해주세요.")

    logger.debug(f"[ProjectDocuments] 세금계산서 사진 인식 완료: direction={direction}, counterparty={counterparty}")
    return TaxInvoiceOcrOut(
        approval_no=r.approval_no,
        issue_date=r.issue_date,
        supplier=TaxInvoicePartyOut(**r.supplier.__dict__),
        recipient=TaxInvoicePartyOut(**r.recipient.__dict__),
        supply_amount=r.supply_amount,
        vat_amount=r.vat_amount,
        total_amount=r.total_amount,
        items=[TaxInvoiceOcrItemOut(**i.__dict__) for i in r.items],
        direction=direction,
        counterparty_name=counterparty,
        warnings=r.warnings,
    )


@router.post("/{doc_id}/images", response_model=ProjectDocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document_image(
    doc_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.doc_type != ProjectDocType.tax_invoice:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="세금계산서에만 사진을 등록할 수 있습니다.")
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 사진을 등록할 수 있습니다.")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지 파일(jpg, png, webp)만 업로드할 수 있습니다.")
    content = file.file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="파일 크기는 15MB를 초과할 수 없습니다.")

    os.makedirs(settings.tax_invoice_images_dir, exist_ok=True)
    stored_name = f"{doc.id}_{uuid.uuid4().hex}.{ALLOWED_IMAGE_TYPES[file.content_type]}"
    file_path = os.path.join(settings.tax_invoice_images_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    doc.images.append(ProjectDocumentImage(filename=file.filename or stored_name, file_path=file_path))
    db.commit()
    logger.debug(f"[ProjectDocuments] 세금계산서 사진 등록: doc_id={doc_id}, filename={file.filename}, by={current_user.id}")
    return _to_out_db(db, _get_doc_or_404(db, doc_id))


@router.get("/{doc_id}/images/{image_id}")
def get_document_image(
    doc_id: int, image_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    image = (
        db.query(ProjectDocumentImage)
        .filter(ProjectDocumentImage.id == image_id, ProjectDocumentImage.document_id == doc_id)
        .first()
    )
    if image is None or not os.path.exists(image.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사진을 찾을 수 없습니다.")
    return FileResponse(image.file_path)


@router.delete("/{doc_id}/images/{image_id}", response_model=ProjectDocumentOut)
def delete_document_image(
    doc_id: int, image_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 사진을 삭제할 수 있습니다.")
    image = next((i for i in doc.images if i.id == image_id), None)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사진을 찾을 수 없습니다.")
    if os.path.exists(image.file_path):
        os.remove(image.file_path)
    doc.images.remove(image)
    db.commit()
    logger.debug(f"[ProjectDocuments] 세금계산서 사진 삭제: doc_id={doc_id}, image_id={image_id}, by={current_user.id}")
    return _to_out_db(db, _get_doc_or_404(db, doc_id))


@router.post("", response_model=ProjectDocumentOut, status_code=status.HTTP_201_CREATED)
def create_project_document(
    payload: ProjectDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if payload.doc_type == ProjectDocType.tax_invoice:
        if not has_menu_permission(current_user, "tax_invoice"):
            logger.debug(f"[ProjectDocuments] 세금계산서 권한 없음, 접근 거부: user_id={current_user.id}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 작성 권한이 없습니다.")
        if payload.received is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="입금/지급 확인 여부를 선택해주세요.")

    project = _resolve_project(db, payload)

    logger.debug(
        f"[ProjectDocuments] 등록: doc_type={payload.doc_type}, project_id={payload.project_id}, "
        f"items={len(payload.items)}, end_title={payload.end_title}, by={current_user.id}"
    )
    doc = _new_document(db, payload, payload.doc_type, project, current_user)
    steps = _apply_approval_request(db, doc, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc, steps)


@router.post("/set", response_model=list[ProjectDocumentOut], status_code=status.HTTP_201_CREATED)
def create_project_document_set(
    payload: ProjectDocumentSetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """견적서+거래명세서를 같은 내용으로 한 번에 작성한다. 두 문서는 set_id로 묶여 한 번의 결재(승인/반려)로
    함께 처리된다. 결재 요청/결과 알림은 견적서 기준으로 한 번만 보낸다. 반환: [견적서, 거래명세서]."""
    project = _resolve_project(db, payload)

    logger.debug(
        f"[ProjectDocuments] 견적서+거래명세서 동시 등록: project_id={payload.project_id}, "
        f"items={len(payload.items)}, end_title={payload.end_title}, by={current_user.id}"
    )
    quotation = _new_document(db, payload, ProjectDocType.quotation, project, current_user)
    statement = _new_document(db, payload, ProjectDocType.statement, project, current_user)
    quotation.set_id = quotation.id
    statement.set_id = quotation.id

    steps_q = _apply_approval_request(db, quotation, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user)
    steps_s = _apply_approval_request(
        db, statement, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user, notify=False
    )
    db.commit()

    outs = []
    for doc, steps in ((quotation, steps_q), (statement, steps_s)):
        doc = _get_doc_or_404(db, doc.id)
        _regenerate_documents(db, doc)
        db.commit()
        db.refresh(doc)
        outs.append(_to_out(doc, steps))
    logger.debug(f"[ProjectDocuments] 동시 등록 완료: set_id={quotation.id}")
    return outs


@router.put("/{doc_id}", response_model=ProjectDocumentOut)
def update_project_document(
    doc_id: int, payload: ProjectDocumentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 수정할 수 있습니다.")
    if doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작성 중이거나 반려된 문서만 수정할 수 있습니다.")
    if doc.set_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="견적서와 거래명세서를 함께 작성한 문서는 수정할 수 없습니다. 삭제 후 다시 작성해주세요.",
        )

    doc.issue_date = payload.issue_date
    doc.currency = payload.currency.value
    doc.purpose_type = payload.purpose_type.value
    doc.client_name = payload.client_name
    doc.manager_name = payload.manager_name
    doc.items = [
        ProjectDocumentItem(content=i.content, quantity=i.quantity, unit_price=i.unit_price, note=i.note, sort_order=idx)
        for idx, i in enumerate(payload.items)
    ]
    doc.status = ProjectDocumentStatus.draft
    doc.approver_id = None
    doc.current_step = 1
    doc.reject_reason = None
    doc.reviewed_at = None
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    logger.debug(f"[ProjectDocuments] 수정: doc_id={doc_id}, by={current_user.id}")
    return _to_out_db(db, doc)


@router.post("/{doc_id}/request-approval", response_model=ProjectDocumentOut)
def request_approval(
    doc_id: int, payload: ApprovalRequestIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 결재를 요청할 수 있습니다.")
    if doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작성 중이거나 반려된 문서만 결재 요청할 수 있습니다.")
    if doc.doc_type == ProjectDocType.tax_invoice and payload.received is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="입금/지급 확인 여부를 선택해주세요.")

    if doc.doc_type == ProjectDocType.tax_invoice:
        doc.payment_received_hint = payload.received
    steps = _apply_approval_request(db, doc, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user)
    # 묶음이면 나머지 문서도 같은 결재선으로 다시 요청한다 (알림은 한 번만).
    siblings = [s for s in _set_siblings(db, doc) if s.status in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected)]
    for sibling in siblings:
        _apply_approval_request(db, sibling, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user, notify=False)
    db.commit()

    for target in siblings:
        refreshed = _get_doc_or_404(db, target.id)
        _regenerate_documents(db, refreshed)
        db.commit()
    doc = _get_doc_or_404(db, doc.id)
    _regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc, steps)


def _approve_one(db: Session, doc: ProjectDocument, current_user: User, notify: bool) -> None:
    """문서 1건의 현재 결재 단계를 승인하고, 마지막 단계면 승인 완료, 아니면 다음 결재권자로 넘긴다 (commit은 호출자가)."""
    steps = get_steps(db, _TARGET, doc.id)
    current = next(s for s in steps if s.step_order == doc.current_step)
    current.status = ApprovalStepStatus.approved
    current.decided_at = datetime.now(timezone.utc)
    doc_label = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}({doc.client_name})"

    if current.step_order == len(steps):
        doc.status = ProjectDocumentStatus.approved
        doc.reviewed_at = datetime.now(timezone.utc)
        _record_tax_invoice_transaction(db, doc, current_user)
        if doc.doc_type == ProjectDocType.tax_invoice and doc.payment_received_hint is not None:
            _finalize_tax_invoice_payment(db, doc, doc.payment_received_hint, current_user)
        if notify:
            create_decision_notification(
                db, target_name=doc.creator.name, target_user_id=doc.created_by, doc_label=doc_label, approved=True, link=_doc_link(doc.doc_type, doc.id)
            )
    else:
        next_step = next(s for s in steps if s.step_order == current.step_order + 1)
        doc.current_step = next_step.step_order
        doc.approver_id = next_step.approver_id
        if notify:
            create_request_notification(
                db, target_user_id=next_step.approver_id, requester_name=doc.creator.name, doc_label=doc_label, link=_doc_link(doc.doc_type, doc.id)
            )
            logger.debug(f"[ProjectDocuments] 다음 결재 요청 알림 발송: doc_id={doc.id}, approver_id={next_step.approver_id}")


@router.put("/{doc_id}/approve", response_model=ProjectDocumentOut)
def approve_project_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 승인할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 승인할 수 있습니다.")

    logger.debug(f"[ProjectDocuments] 결재 승인 시도: id={doc_id}, by={current_user.id}")
    _approve_one(db, doc, current_user, notify=True)
    # 견적서+거래명세서 묶음이면 한 번의 승인으로 나머지 문서도 같은 단계까지 함께 승인한다 (알림은 중복 발송하지 않는다).
    siblings = [s for s in _set_siblings(db, doc) if s.status == ProjectDocumentStatus.pending and s.approver_id == current_user.id]
    for sibling in siblings:
        _approve_one(db, sibling, current_user, notify=False)
        logger.debug(f"[ProjectDocuments] 묶음 문서 함께 승인: doc_id={sibling.id}, set_id={doc.set_id}")
    db.commit()

    for target in [doc, *siblings]:
        refreshed = _get_doc_or_404(db, target.id)
        _regenerate_documents(db, refreshed)
        db.commit()
    doc = _get_doc_or_404(db, doc.id)
    logger.debug(f"[ProjectDocuments] 결재 승인 완료: id={doc_id}, by={current_user.id}")
    return _to_out(doc, get_steps(db, _TARGET, doc.id))


@router.post("/{doc_id}/confirm-payment", response_model=ProjectDocumentOut)
def confirm_tax_invoice_payment(
    doc_id: int,
    payload: TaxInvoicePaymentConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """작성/재요청 시점에 입금·지급 확인 여부를 받지 못한 세금계산서를 위한 수동 확인용 보조 엔드포인트.
    정상적인 흐름에서는 작성 시점에 받은 응답이 승인과 동시에 자동 반영되므로 호출될 일이 거의 없다."""
    doc = _get_doc_or_404(db, doc_id)
    if doc.doc_type != ProjectDocType.tax_invoice:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="세금계산서만 입금/지급 확인이 가능합니다.")
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 승인된 세금계산서만 확인할 수 있습니다.")
    if doc.payment_recorded:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 입출금 내역이 기록된 문서입니다.")

    _finalize_tax_invoice_payment(db, doc, payload.received, current_user)
    db.commit()
    db.refresh(doc)
    return _to_out_db(db, doc)


def _reject_one(db: Session, doc: ProjectDocument, reason: str, notify: bool) -> None:
    steps = get_steps(db, _TARGET, doc.id)
    current = next(s for s in steps if s.step_order == doc.current_step)
    current.status = ApprovalStepStatus.rejected
    current.decided_at = datetime.now(timezone.utc)

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


@router.put("/{doc_id}/reject", response_model=ProjectDocumentOut)
def reject_project_document(
    doc_id: int, payload: RejectIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = _get_doc_or_404(db, doc_id)
    if doc.approver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="배정된 결재권자만 반려할 수 있습니다.")
    if doc.status != ProjectDocumentStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 대기 중인 문서만 반려할 수 있습니다.")

    _reject_one(db, doc, payload.reason, notify=True)
    # 묶음이면 나머지 문서도 함께 반려한다 (알림은 한 번만).
    siblings = [s for s in _set_siblings(db, doc) if s.status == ProjectDocumentStatus.pending and s.approver_id == current_user.id]
    for sibling in siblings:
        _reject_one(db, sibling, payload.reason, notify=False)
        logger.debug(f"[ProjectDocuments] 묶음 문서 함께 반려: doc_id={sibling.id}, set_id={doc.set_id}")
    db.commit()

    for target in [doc, *siblings]:
        refreshed = _get_doc_or_404(db, target.id)
        _regenerate_documents(db, refreshed)
        db.commit()
    doc = _get_doc_or_404(db, doc.id)
    logger.debug(f"[ProjectDocuments] 결재 반려: id={doc_id}, by={current_user.id}, reason={payload.reason}")
    return _to_out(doc, get_steps(db, _TARGET, doc.id))


@router.get("/{doc_id}/pdf")
def download_project_document_pdf(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="결재 승인 후에 저장/출력/발송할 수 있습니다.")
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF 파일을 찾을 수 없습니다.")

    logger.debug(f"[ProjectDocuments] PDF 다운로드: id={doc_id}, by={current_user.id}")
    filename = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}_{doc.issue_date.isoformat()}.pdf"
    return FileResponse(doc.file_path, media_type="application/pdf", filename=filename)


@router.get("/{doc_id}/excel")
def download_project_document_excel(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="결재 승인 후에 저장/발송할 수 있습니다.")
    if not doc.excel_path or not os.path.exists(doc.excel_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="엑셀 파일을 찾을 수 없습니다.")

    logger.debug(f"[ProjectDocuments] 엑셀 다운로드: id={doc_id}, by={current_user.id}")
    filename = f"{DOC_TYPE_LABELS_KO[doc.doc_type]}_{doc.issue_date.isoformat()}.xlsx"
    return FileResponse(
        doc.excel_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@router.post("/{doc_id}/popbill/issue", response_model=PopbillIssueOut)
def issue_popbill_tax_invoice(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if not has_menu_permission(current_user, "tax_invoice"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 발행 권한이 없습니다.")
    if doc.doc_type != ProjectDocType.tax_invoice:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="세금계산서만 팝빌로 발행할 수 있습니다.")
    if doc.direction == "purchase":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="받은(매입) 세금계산서는 팝빌로 발행할 수 없습니다.")
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 승인 후에 발행할 수 있습니다.")
    if doc.popbill_issued_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 발행된 세금계산서입니다.")

    logger.debug(f"[ProjectDocuments] 팝빌 세금계산서 발행 시도: doc_id={doc_id}, by={current_user.id}")
    try:
        client = doc.effective_client
        if client is None:
            raise popbill_service.PopbillConfigError(
                f"거래처관리에 '{doc.client_name}'(으)로 등록된 거래처가 없어 발행할 수 없습니다. 거래처를 먼저 등록해주세요."
            )
        result = popbill_service.issue_tax_invoice(doc, client)
    except popbill_service.PopbillConfigError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except PopbillException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"팝빌 오류 [{err.code}] {err.message}")

    doc.popbill_mgt_key = result["mgt_key"]
    doc.popbill_nts_confirm_num = result["nts_confirm_num"]
    doc.popbill_issued_at = datetime.now(timezone.utc)
    db.commit()
    logger.debug(f"[ProjectDocuments] 팝빌 세금계산서 발행 완료: doc_id={doc_id}, nts_confirm_num={doc.popbill_nts_confirm_num}")
    return PopbillIssueOut(nts_confirm_num=doc.popbill_nts_confirm_num, issued_at=doc.popbill_issued_at)


@router.get("/{doc_id}/popbill/view-url")
def get_popbill_view_url(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if not doc.popbill_mgt_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="아직 팝빌로 발행되지 않았습니다.")
    try:
        url = popbill_service.get_view_url(doc)
    except PopbillException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"팝빌 오류 [{err.code}] {err.message}")
    logger.debug(f"[ProjectDocuments] 팝빌 문서 보기 URL 조회: doc_id={doc_id}, by={current_user.id}")
    return {"url": url}


@router.get("/{doc_id}/popbill/pdf-url")
def get_popbill_pdf_url(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = _get_doc_or_404(db, doc_id)
    if not doc.popbill_mgt_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="아직 팝빌로 발행되지 않았습니다.")
    try:
        url = popbill_service.get_pdf_url(doc)
    except PopbillException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"팝빌 오류 [{err.code}] {err.message}")
    logger.debug(f"[ProjectDocuments] 팝빌 PDF URL 조회: doc_id={doc_id}, by={current_user.id}")
    return {"url": url}


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    if doc.status == ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서는 삭제할 수 없습니다.")
    # 묶음(견적서+거래명세서)이면 함께 삭제한다.
    targets = [doc]
    if doc.set_id is not None:
        targets = db.query(ProjectDocument).filter(ProjectDocument.set_id == doc.set_id).all()
        if any(t.status == ProjectDocumentStatus.approved for t in targets):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서는 삭제할 수 없습니다.")
    for target in targets:
        for image in target.images:
            if os.path.exists(image.file_path):
                os.remove(image.file_path)
        db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == target.id).delete()
        db.delete(target)
    db.commit()
    logger.debug(f"[ProjectDocuments] 삭제: id={doc_id}, by={current_user.id}")
    return None
