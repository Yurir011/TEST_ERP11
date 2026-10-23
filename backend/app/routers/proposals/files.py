"""품의서 PDF 다운로드, 첨부(파일·링크) 추가·다운로드·삭제."""
import os
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.proposal import ATTACHMENT_DOC_KINDS, ProposalAttachment, ProposalAttachmentKind, ProposalStatus
from app.models.user import User
from app.routers.proposals._common import (
    ALLOWED_ATTACHMENT_TYPES,
    MAX_ATTACHMENT_FILES,
    MAX_ATTACHMENT_SIZE,
    PREFIX,
    _get_or_404,
    _to_out,
    logger,
)
from app.schemas.proposal import AttachmentDocKindIn, ProposalLinkAttachmentIn, ProposalOut
from app.services import proposal_files
from app.services.proposal_excel import generate_proposal_excel
from app.services.upload_check import ATTACHMENT_TYPES, EXTENSIONS, read_upload

router = APIRouter(prefix=PREFIX, tags=["proposals"])


@router.get("/{proposal_id}/pdf")
def download_proposal_pdf(proposal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = _get_or_404(db, proposal_id)
    # 저장된 PDF 는 승인·첨부가 바뀔 때만 다시 만들어져서, 양식을 고쳐도 옛 문서는 옛 모양으로 남는다.
    # 그래서 내려받을 때마다 현재 양식으로 다시 만든다 (내용·결재 현황은 그대로). 만들지 못하면 저장된 파일을 그대로 준다.
    try:
        proposal_files.regenerate_pdf(p)
        db.commit()
    except Exception:  # noqa: BLE001 - 어떤 이유로든 실패하면 기존 파일로 대신한다
        db.rollback()
        logger.exception(f"[Proposals] PDF 다시 만들기 실패, 저장된 파일로 대체: id={proposal_id}")
        p = _get_or_404(db, proposal_id)
    if not p.file_path or not os.path.exists(p.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF 파일을 찾을 수 없습니다.")
    logger.debug(f"[Proposals] PDF 다운로드: id={proposal_id}, by={current_user.id}")
    filename = f"품의서_{p.issue_date.isoformat()}.pdf"
    return FileResponse(p.file_path, media_type="application/pdf", filename=filename)


def _normalize_doc_kind(value: str | None) -> str | None:
    """서류 종류 값 검사: 거래명세서(statement)·세금계산서(tax_invoice)·인보이스(invoice)만 저장하고, 비었거나 "other"는 종류 없음(None)으로 둔다."""
    if value is None or value.strip() in ("", "other"):
        return None
    if value not in ATTACHMENT_DOC_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="서류 종류가 올바르지 않습니다. (거래명세서·세금계산서·인보이스·기타)")
    return value


@router.get("/{proposal_id}/excel")
def download_proposal_excel(proposal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """승인된 품의서를 엑셀로 내려받는다 (저장해 두지 않고 요청할 때 만든다)."""
    p = _get_or_404(db, proposal_id)
    if p.status != ProposalStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="결재 승인 후에 저장할 수 있습니다.")
    logger.debug(f"[Proposals] 엑셀 다운로드: id={proposal_id}, by={current_user.id}")
    filename = quote(f"품의서_{p.issue_date.isoformat()}.xlsx")
    return Response(
        content=generate_proposal_excel(p),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.post("/{proposal_id}/attachments/file", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
def upload_attachment_file(
    proposal_id: int,
    file: UploadFile = File(...),
    doc_kind: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_or_404(db, proposal_id)
    kind_value = _normalize_doc_kind(doc_kind)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 첨부파일을 추가할 수 있습니다.")
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 파일 형식입니다. (PNG·JPG·PDF·XLS·XLSX·DOC·DOCX·PPT·PPTX·TXT)")
    if sum(1 for a in p.attachments if a.kind == ProposalAttachmentKind.file) >= MAX_ATTACHMENT_FILES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"첨부파일은 최대 {MAX_ATTACHMENT_FILES}개까지 올릴 수 있습니다.")

    content = read_upload(file, ATTACHMENT_TYPES, MAX_ATTACHMENT_SIZE)

    os.makedirs(settings.proposal_attachments_dir, exist_ok=True)
    # 저장 확장자는 사용자가 붙인 파일 이름이 아니라 확인된 형식에서 정한다 (원래 이름은 label 로 보관해 다운로드 때 쓴다).
    stored_name = f"{proposal_id}_{uuid.uuid4().hex}.{EXTENSIONS[file.content_type]}"
    file_path = os.path.join(settings.proposal_attachments_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    attachment = ProposalAttachment(
        proposal_id=p.id,
        kind=ProposalAttachmentKind.file,
        label=file.filename or stored_name,
        file_path=file_path,
        doc_kind=kind_value,
        created_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    logger.debug(f"[Proposals] 첨부파일 업로드: proposal_id={proposal_id}, filename={file.filename}, by={current_user.id}")

    p = _get_or_404(db, proposal_id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.post("/{proposal_id}/attachments/link", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
def add_attachment_link(
    proposal_id: int,
    payload: ProposalLinkAttachmentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 첨부링크를 추가할 수 있습니다.")

    attachment = ProposalAttachment(
        proposal_id=p.id,
        kind=ProposalAttachmentKind.link,
        label=payload.label.strip() if payload.label and payload.label.strip() else payload.url,
        url=payload.url,
        created_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    logger.debug(f"[Proposals] 첨부링크 추가: proposal_id={proposal_id}, url={payload.url}, by={current_user.id}")

    p = _get_or_404(db, proposal_id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.get("/{proposal_id}/attachments/{attachment_id}/file")
def download_attachment_file(
    proposal_id: int, attachment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    attachment = (
        db.query(ProposalAttachment)
        .filter(ProposalAttachment.id == attachment_id, ProposalAttachment.proposal_id == proposal_id)
        .first()
    )
    if attachment is None or attachment.kind != ProposalAttachmentKind.file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")
    if not attachment.file_path or not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")
    logger.debug(f"[Proposals] 첨부파일 다운로드: proposal_id={proposal_id}, attachment_id={attachment_id}, by={current_user.id}")
    return FileResponse(attachment.file_path, filename=attachment.label)


@router.put("/{proposal_id}/attachments/{attachment_id}/kind", response_model=ProposalOut)
def set_attachment_kind(
    proposal_id: int,
    attachment_id: int,
    payload: AttachmentDocKindIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """이미 올린 첨부 파일의 서류 종류(거래명세서·세금계산서·인보이스·기타)를 바꾼다. 작성자만, 파일 첨부에만 할 수 있다."""
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 서류 종류를 바꿀 수 있습니다.")
    attachment = next((a for a in p.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")
    if attachment.kind != ProposalAttachmentKind.file:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="파일 첨부만 서류 종류를 정할 수 있습니다.")
    attachment.doc_kind = _normalize_doc_kind(payload.doc_kind)
    db.commit()
    logger.debug(f"[Proposals] 첨부 서류 종류 변경: proposal_id={proposal_id}, attachment_id={attachment_id}, doc_kind={attachment.doc_kind}, by={current_user.id}")
    return _to_out(_get_or_404(db, proposal_id))


@router.delete("/{proposal_id}/attachments/{attachment_id}", response_model=ProposalOut)
def delete_attachment(
    proposal_id: int, attachment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    p = _get_or_404(db, proposal_id)
    if p.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="작성자만 첨부파일을 삭제할 수 있습니다.")
    attachment = next((a for a in p.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="첨부파일을 찾을 수 없습니다.")

    if attachment.file_path and os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)
    db.delete(attachment)
    db.commit()
    logger.debug(f"[Proposals] 첨부파일 삭제: proposal_id={proposal_id}, attachment_id={attachment_id}, by={current_user.id}")

    p = _get_or_404(db, proposal_id)
    proposal_files.regenerate_pdf(p)
    db.commit()
    db.refresh(p)
    return _to_out(p)
