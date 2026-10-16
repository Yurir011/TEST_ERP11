"""문서 작성·수정·삭제 (견적서+거래명세서 묶음 작성 포함)."""
import os
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.approval_step import ApprovalStep
from app.models.client import Client
from app.models.project import Project
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentItem, ProjectDocumentStatus
from app.models.user import User, has_menu_permission
from app.schemas.project_document import ProjectDocumentCreate, ProjectDocumentOut, ProjectDocumentSetCreate, ProjectDocumentUpdate
from app.services import project_document_files as doc_files
from app.services.project_document_template import next_doc_no

from app.routers.project_documents._common import PREFIX, _TARGET, _apply_approval_request, _get_doc_or_404, _to_out, _to_out_db, logger


router = APIRouter(prefix=PREFIX, tags=["project-documents"])


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
        remark=(payload.remark or "").strip() or None if doc_type == ProjectDocType.purchase_order else None,
        created_by=current_user.id,
        direction=payload.direction if doc_type == ProjectDocType.tax_invoice else None,
        approval_no=payload.approval_no if doc_type == ProjectDocType.tax_invoice else None,
        is_paper=payload.is_paper if doc_type == ProjectDocType.tax_invoice else False,
    )
    if doc.is_paper:
        doc.direction = "purchase"  # 종이 세금계산서는 받은(매입) 세금계산서다
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


@router.post("", response_model=ProjectDocumentOut, status_code=status.HTTP_201_CREATED)
def create_project_document(
    payload: ProjectDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if payload.doc_type == ProjectDocType.tax_invoice:
        if not has_menu_permission(current_user, "tax_invoice"):
            logger.debug(f"[ProjectDocuments] 세금계산서 권한 없음, 접근 거부: user_id={current_user.id}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 작성 권한이 없습니다.")

    project = _resolve_project(db, payload)

    logger.debug(
        f"[ProjectDocuments] 등록: doc_type={payload.doc_type}, project_id={payload.project_id}, "
        f"items={len(payload.items)}, end_title={payload.end_title}, by={current_user.id}"
    )
    doc = _new_document(db, payload, payload.doc_type, project, current_user)
    steps = _apply_approval_request(db, doc, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user)
    db.commit()

    doc = _get_doc_or_404(db, doc.id)
    doc_files.regenerate_documents(db, doc)
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
        doc_files.regenerate_documents(db, doc)
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

    # 승인된 문서는 수정할 수 있지만 반드시 결재를 다시 받아야 한다 (세금계산서는 팝빌로 발행하기 전까지만).
    editing_approved = doc.status == ProjectDocumentStatus.approved
    if editing_approved:
        if doc.popbill_issued_at is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="팝빌로 발행된 세금계산서는 수정할 수 없습니다.")
        # 대금 결제(입금/출금)가 끝난 뒤에도 수정할 수 있다. 재승인 시 매입매출 내역이 새 내용으로 갱신된다.
        if not payload.request_approval:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서를 수정하려면 결재를 다시 요청해야 합니다.")
    elif doc.status not in (ProjectDocumentStatus.draft, ProjectDocumentStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="작성 중이거나 반려된 문서만 수정할 수 있습니다.")
    if doc.set_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="견적서와 거래명세서를 함께 작성한 문서는 수정할 수 없습니다. 삭제 후 다시 작성해주세요.",
        )

    if payload.update_project:
        if payload.project_id is None and not (payload.project_other_name or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="관련 프로젝트를 선택하거나 '기타' 내용을 입력해주세요.")
        if payload.project_id is not None and db.query(Project).filter(Project.id == payload.project_id).first() is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 프로젝트입니다.")
        doc.project_id = payload.project_id
        doc.project_other_name = None if payload.project_id is not None else (payload.project_other_name or "").strip()

    if payload.is_paper is not None and doc.doc_type == ProjectDocType.tax_invoice:
        doc.is_paper = payload.is_paper
        if payload.is_paper:
            doc.direction = "purchase"
    doc.issue_date = payload.issue_date
    doc.currency = payload.currency.value
    doc.purpose_type = payload.purpose_type.value
    doc.client_name = payload.client_name
    doc.manager_name = payload.manager_name
    if doc.doc_type == ProjectDocType.purchase_order:
        doc.remark = (payload.remark or "").strip() or None
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
    if payload.update_project and doc.project is None:
        doc.other_client = _find_client(db, payload.client_name, (doc.counterparty_info or {}).get("reg_no"))
    steps = []
    if payload.request_approval:
        steps = _apply_approval_request(db, doc, payload.end_title, payload.approver_ids, payload.is_final_decision, current_user)
        db.commit()
        doc = _get_doc_or_404(db, doc.id)
    doc_files.regenerate_documents(db, doc)
    db.commit()
    db.refresh(doc)
    logger.debug(
        f"[ProjectDocuments] 수정: doc_id={doc_id}, by={current_user.id}, was_approved={editing_approved}, request_approval={payload.request_approval}"
    )
    return _to_out(doc, steps) if payload.request_approval else _to_out_db(db, doc)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="문서를 찾을 수 없습니다.")
    if doc.delete_requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="삭제 결재가 진행 중인 문서입니다.")
    if doc.status == ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서는 삭제 결재를 요청해야 삭제할 수 있습니다.")
    # 묶음(견적서+거래명세서)이면 함께 삭제한다.
    targets = [doc]
    if doc.set_id is not None:
        targets = db.query(ProjectDocument).filter(ProjectDocument.set_id == doc.set_id).all()
        if any(t.status == ProjectDocumentStatus.approved for t in targets):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="승인된 문서는 삭제 결재를 요청해야 삭제할 수 있습니다.")
    for target in targets:
        for image in target.images:
            if os.path.exists(image.file_path):
                os.remove(image.file_path)
        db.query(ApprovalStep).filter(ApprovalStep.target_type == _TARGET, ApprovalStep.target_id == target.id).delete()
        db.delete(target)
    db.commit()
    logger.debug(f"[ProjectDocuments] 삭제: id={doc_id}, by={current_user.id}")
    return None
