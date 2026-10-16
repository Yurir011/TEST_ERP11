"""팝빌 전자세금계산서 발행과 조회."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from popbill import PopbillException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.client import Client
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.user import User, has_menu_permission
from app.schemas.project_document import PopbillIssueIn, PopbillIssueOut, PopbillRequiredInfoOut
from app.services import popbill_service

from app.routers.project_documents._common import PREFIX, _get_doc_or_404, logger


router = APIRouter(prefix=PREFIX, tags=["project-documents"])


def _check_popbill_issuable(doc: ProjectDocument, current_user: User) -> Client:
    if not has_menu_permission(current_user, "tax_invoice"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="세금계산서 발행 권한이 없습니다.")
    if doc.doc_type != ProjectDocType.tax_invoice:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="세금계산서만 팝빌로 발행할 수 있습니다.")
    if doc.is_paper:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종이 세금계산서는 팝빌로 발행할 수 없습니다.")
    if doc.direction == "purchase":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="받은(매입) 세금계산서는 팝빌로 발행할 수 없습니다.")
    if doc.status != ProjectDocumentStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재 승인 후에 발행할 수 있습니다.")
    if doc.popbill_issued_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 발행된 세금계산서입니다.")
    client = doc.effective_client
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"거래처관리에 '{doc.client_name}'(으)로 등록된 거래처가 없어 발행할 수 없습니다. 거래처를 먼저 등록해주세요.",
        )
    return client


@router.get("/{doc_id}/popbill/required-info", response_model=PopbillRequiredInfoOut)
def get_popbill_required_info(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """발행 전에 거래처 정보 중 부족한 항목을 알려준다 (프론트가 입력 팝업을 띄우는 데 사용)."""
    doc = _get_doc_or_404(db, doc_id)
    client = _check_popbill_issuable(doc, current_user)
    missing = popbill_service.find_missing_client_fields(client)
    logger.debug(f"[ProjectDocuments] 팝빌 필수정보 점검: doc_id={doc_id}, client_id={client.id}, missing={missing}")
    return PopbillRequiredInfoOut(client_name=client.name, missing=missing, values=popbill_service.client_field_values(client))


@router.post("/{doc_id}/popbill/issue", response_model=PopbillIssueOut)
def issue_popbill_tax_invoice(
    doc_id: int,
    payload: PopbillIssueIn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_doc_or_404(db, doc_id)
    client = _check_popbill_issuable(doc, current_user)

    if payload is not None:
        # 팝업에서 보완 입력한 값은 거래처관리에도 저장해 다음 발행부터 다시 묻지 않는다.
        for field in ("biz_reg_no", "ceo_name", "address", "biz_type", "biz_class", "email"):
            value = (getattr(payload, field) or "").strip()
            if value:
                setattr(client, field, value)
        db.commit()
        client = _check_popbill_issuable(_get_doc_or_404(db, doc_id), current_user)
        logger.debug(f"[ProjectDocuments] 팝빌 발행 전 거래처 정보 보완 저장: doc_id={doc_id}, client_id={client.id}")

    logger.debug(f"[ProjectDocuments] 팝빌 세금계산서 발행 시도: doc_id={doc_id}, by={current_user.id}")
    try:
        result = popbill_service.issue_tax_invoice(doc, client, current_user.email)
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
