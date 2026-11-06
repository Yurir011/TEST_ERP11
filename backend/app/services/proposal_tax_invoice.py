"""구매 품의서에 '세금계산서'로 올린 첨부 파일 → 세금계산서 목록(받은 매입 세금계산서)에 자동 등록.

- 이미지(jpg/png/webp)는 사진 인식(OCR)으로 번호·날짜·금액·거래처·품목을 채우고, 읽지 못한 칸(과 PDF 등 인식할 수 없는 파일)은
  품의서의 금액·거래처·제목으로 채운다.
- 등록된 문서는 작성 중(draft) 상태다. 작성자가 세금계산서 목록에서 내용을 확인한 뒤 결재를 요청하고, 승인되면 일반 세금계산서처럼 매입매출에 기록된다.
  (이미 그 품의서의 매입이 있으면 새로 만들지 않고 그 매입에 세금계산서 번호만 붙인다 — tax_invoice_ledger 참고.)
- 같은 첨부로 두 번 등록하지 않는다. 첨부를 지우거나 종류를 바꾸면 아직 결재 전(작성 중·반려)인 문서와 사진을 함께 치운다.
commit 은 호출한 쪽이 한다.
"""
import os
import shutil
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalTargetType
from app.models.client import Client
from app.models.project_document import (
    DocCurrency,
    ProjectDocType,
    ProjectDocument,
    ProjectDocumentImage,
    ProjectDocumentItem,
    ProjectDocumentStatus,
    TaxInvoicePurpose,
)
from app.models.proposal import PURCHASE_KIND, Proposal, ProposalAttachment, ProposalAttachmentKind
from app.models.user import User, has_menu_permission

logger = get_logger("ProposalTaxInvoice")

_OCR_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def _digits(value: str | None) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def _ocr(path: str):
    """이미지면 세금계산서 사진 인식을 해 본다. 인식할 수 없거나 실패하면 None."""
    if not path.lower().endswith(_OCR_EXTENSIONS):
        return None
    try:
        from app.services.tax_invoice_ocr import recognize_tax_invoice

        with open(path, "rb") as f:
            return recognize_tax_invoice(f.read())
    except Exception as exc:  # noqa: BLE001 - 인식 실패는 품의서 값으로 대신 채우면 되므로 첨부 올리기를 막지 않는다
        logger.warning(f"[ProposalTaxInvoice] 사진 인식 실패, 품의서 값으로 채움: {exc}")
        return None


def register_from_attachment(db: Session, p: Proposal, att: ProposalAttachment, actor: User) -> ProjectDocument | None:
    """세금계산서로 올린 파일 첨부를 받은(매입) 세금계산서 문서로 등록한다. 등록하지 않으면 None."""
    if p.kind != PURCHASE_KIND or att.kind != ProposalAttachmentKind.file or att.doc_kind != "tax_invoice":
        return None
    if db.query(ProjectDocument.id).filter(ProjectDocument.proposal_attachment_id == att.id).first() is not None:
        logger.debug(f"[ProposalTaxInvoice] 이미 등록된 첨부, 건너뜀: attachment_id={att.id}")
        return None
    if not has_menu_permission(actor, "tax_invoice"):
        logger.debug(f"[ProposalTaxInvoice] 세금계산서 권한이 없어 자동 등록 생략: proposal_id={p.id}, user_id={actor.id}")
        return None
    if not att.file_path or not os.path.exists(att.file_path):
        logger.warning(f"[ProposalTaxInvoice] 첨부 파일이 없어 자동 등록 생략: attachment_id={att.id}")
        return None

    ocr = _ocr(att.file_path)
    supply_fallback = round(float(p.amount)) if p.amount is not None else 0
    currency = p.currency if p.currency in {c.value for c in DocCurrency} else DocCurrency.KRW.value

    items: list[ProjectDocumentItem] = []
    if ocr is not None:
        for it in ocr.items:
            if it.content:
                items.append(
                    ProjectDocumentItem(content=it.content[:300], quantity=max(1, round(it.quantity)), unit_price=it.unit_price, sort_order=len(items))
                )
    if not items:
        supply = ocr.supply_amount if ocr is not None and ocr.supply_amount else supply_fallback
        items = [ProjectDocumentItem(content=(p.title or "구매 품목")[:300], quantity=1, unit_price=supply, sort_order=0)]

    # 거래처: 품의서에 올린 것은 받은 계산서이므로 공급자가 거래처다. 읽지 못하면 품의서의 거래처.
    # 단, 우리 회사가 공급자로 읽힌 경우(잘못 올렸거나 인식 오류)에는 인식 결과를 믿지 않고 품의서 값을 쓴다.
    ours = _digits(settings.company_reg_no)
    party = ocr.supplier if ocr is not None and not (ours and _digits(ocr.supplier.reg_no) == ours) else None
    client_name = (party.name if party and party.name else None) or p.vendor_name or "거래처 미확인"
    snapshot = {k: v for k, v in party.__dict__.items() if v} if party else {}
    reg_digits = _digits(snapshot.get("reg_no"))
    client = next(
        (c for c in db.query(Client).all() if (reg_digits and _digits(c.biz_reg_no) == reg_digits) or c.name == client_name),
        None,
    )

    doc = ProjectDocument(
        project_id=None,
        project_other_name=f"구매 품의서 No. {p.doc_no}"[:200],
        proposal_id=p.id,
        proposal_attachment_id=att.id,
        doc_type=ProjectDocType.tax_invoice,
        issue_date=(ocr.issue_date if ocr is not None and ocr.issue_date else p.issue_date),
        currency=currency,
        purpose_type=TaxInvoicePurpose.receipt.value,
        client_name=client_name,
        created_by=actor.id,
        direction="purchase",
        approval_no=(ocr.approval_no if ocr is not None else None),
        counterparty_info=snapshot or None,
        other_client=client,
        status=ProjectDocumentStatus.draft,
    )
    doc.items = items
    doc.creator = actor
    db.add(doc)
    db.flush()

    os.makedirs(settings.tax_invoice_images_dir, exist_ok=True)
    ext = os.path.splitext(att.file_path)[1].lower() or ".bin"
    stored = os.path.join(settings.tax_invoice_images_dir, f"{doc.id}_{uuid.uuid4().hex}{ext}")
    shutil.copyfile(att.file_path, stored)
    doc.images.append(ProjectDocumentImage(filename=att.label, file_path=stored))
    logger.debug(
        f"[ProposalTaxInvoice] 세금계산서 자동 등록: proposal_id={p.id}, attachment_id={att.id}, doc_id={doc.id}, "
        f"ocr={'성공' if ocr is not None else '없음(품의서 값 사용)'}, client={client_name}, items={len(items)}"
    )
    return doc


def unregister_for_attachment(db: Session, attachment_id: int) -> None:
    """첨부가 지워지거나 종류가 바뀌면, 그 첨부로 자동 등록된 문서 중 아직 결재 전(작성 중·반려)인 것을 사진과 함께 지운다.
    결재가 진행 중이거나 승인된 문서는 그대로 둔다 (그 문서는 세금계산서 목록에서 따로 정리한다)."""
    docs = db.query(ProjectDocument).filter(ProjectDocument.proposal_attachment_id == attachment_id).all()
    for doc in docs:
        if doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
            logger.debug(f"[ProposalTaxInvoice] 결재가 시작된 문서는 유지: doc_id={doc.id}, status={doc.status.value}")
            continue
        for image in doc.images:
            if os.path.exists(image.file_path):
                os.remove(image.file_path)
        db.query(ApprovalStep).filter(ApprovalStep.target_type == ApprovalTargetType.project_document, ApprovalStep.target_id == doc.id).delete()
        db.delete(doc)
        logger.debug(f"[ProposalTaxInvoice] 자동 등록 문서 삭제: doc_id={doc.id}, attachment_id={attachment_id}")
    db.flush()
