"""세금계산서 이미지 업로드·조회·삭제와 사진 인식(OCR)."""
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.project_document import ProjectDocType, ProjectDocumentImage
from app.models.user import User, has_menu_permission
from app.schemas.project_document import ProjectDocumentOut, TaxInvoiceOcrItemOut, TaxInvoiceOcrOut, TaxInvoicePartyOut
from app.services.tax_invoice_ocr import recognize_tax_invoice

from app.routers.project_documents._common import PREFIX, _get_doc_or_404, _to_out_db, logger


router = APIRouter(prefix=PREFIX, tags=["project-documents"])


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
