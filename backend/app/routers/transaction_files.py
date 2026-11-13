"""매입매출 거래에 세금계산서 파일 붙이기: 목록·올리기(여러 개)·받기·삭제. 매입매출 메뉴 권한이 있는 계정이 쓴다."""
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.core.deps import require_menu_access
from app.database import get_db
from app.logging_config import get_logger
from app.models.transaction import Transaction
from app.models.transaction_file import TransactionFile
from app.models.user import User

router = APIRouter(prefix="/api/transactions", tags=["transaction-files"])
logger = get_logger("TransactionFile")
require_transactions_access = require_menu_access("transactions")

MAX_FILE_BYTES = 20 * 1024 * 1024  # 파일 하나
MAX_FILES_PER_TX = 20
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".xml", ".xls", ".xlsx", ".csv", ".hwp", ".hwpx", ".doc", ".docx", ".txt", ".zip"}


class TransactionFileOut(BaseModel):
    id: int
    transaction_id: int
    filename: str
    file_size: int
    uploaded_by: str | None
    created_at: datetime


def _ensure_tx(db: Session, tx_id: int) -> None:
    if db.query(Transaction.id).filter(Transaction.id == tx_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")


def _safe_name(name: str) -> str:
    return os.path.basename((name or "").replace("\\", "/")).strip() or "file"


def _list(db: Session, tx_id: int) -> list[TransactionFileOut]:
    rows = (
        db.query(TransactionFile)
        .options(selectinload(TransactionFile.uploader))
        .filter(TransactionFile.transaction_id == tx_id)
        .order_by(TransactionFile.id)
        .all()
    )
    return [
        TransactionFileOut(id=f.id, transaction_id=f.transaction_id, filename=f.filename, file_size=f.file_size, uploaded_by=f.uploader.name if f.uploader else None, created_at=f.created_at)
        for f in rows
    ]


@router.get("/{tx_id}/files", response_model=list[TransactionFileOut])
def list_files(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)):
    _ensure_tx(db, tx_id)
    rows = _list(db, tx_id)
    logger.debug(f"[TransactionFile] 목록: tx_id={tx_id}, count={len(rows)}, by={current_user.id}")
    return rows


@router.post("/{tx_id}/files", response_model=list[TransactionFileOut], status_code=status.HTTP_201_CREATED)
def upload_files(
    tx_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_transactions_access),
):
    """세금계산서 파일을 한 번에 여러 개 붙인다 (PDF·이미지·XML·엑셀 등, 파일당 20MB 이하, 거래당 20개까지)."""
    _ensure_tx(db, tx_id)
    existing = db.query(TransactionFile).filter(TransactionFile.transaction_id == tx_id).count()
    if not files or existing + len(files) > MAX_FILES_PER_TX:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"파일은 거래마다 {MAX_FILES_PER_TX}개까지 붙일 수 있습니다. (현재 {existing}개)")
    logger.debug(f"[TransactionFile] 올리기 시도: tx_id={tx_id}, files={len(files)}, by={current_user.id}")
    saved: list[str] = []
    try:
        for f in files:
            name = _safe_name(f.filename or "")
            if os.path.splitext(name)[1].lower() not in ALLOWED_EXT:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"올릴 수 없는 파일 형식입니다: {name}")
            data = f.file.read(MAX_FILE_BYTES + 1)
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"파일이 너무 큽니다: {name} (파일당 {MAX_FILE_BYTES // 1024 // 1024}MB 이하)")
            if not data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"빈 파일입니다: {name}")
            os.makedirs(settings.transaction_files_dir, exist_ok=True)
            stored = os.path.join(settings.transaction_files_dir, f"{tx_id}_{uuid.uuid4().hex}")
            with open(stored, "wb") as out:
                out.write(data)
            saved.append(stored)
            db.add(TransactionFile(transaction_id=tx_id, filename=name[:255], file_path=stored, file_size=len(data), content_type=f.content_type, created_by=current_user.id))
        db.commit()
    except Exception:
        db.rollback()
        for path in saved:  # 중간에 실패하면 이미 저장한 파일도 지운다 (한 번에 전부 올라가거나 전부 안 올라간다)
            try:
                os.remove(path)
            except OSError:
                pass
        raise
    logger.debug(f"[TransactionFile] 올리기 완료: tx_id={tx_id}, files={len(saved)}")
    return _list(db, tx_id)


def _get_or_404(db: Session, tx_id: int, file_id: int) -> TransactionFile:
    f = db.query(TransactionFile).filter(TransactionFile.id == file_id, TransactionFile.transaction_id == tx_id).first()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="파일을 찾을 수 없습니다.")
    return f


@router.get("/{tx_id}/files/{file_id}/file")
def download_file(tx_id: int, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)):
    f = _get_or_404(db, tx_id, file_id)
    if not os.path.isfile(f.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장된 파일을 찾을 수 없습니다.")
    logger.debug(f"[TransactionFile] 받기: tx_id={tx_id}, id={file_id}, by={current_user.id}")
    return FileResponse(f.file_path, media_type=f.content_type or "application/octet-stream", filename=f.filename)


@router.delete("/{tx_id}/files/{file_id}", response_model=list[TransactionFileOut])
def delete_file(tx_id: int, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_transactions_access)):
    f = _get_or_404(db, tx_id, file_id)
    path = f.file_path
    db.delete(f)
    db.commit()
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        logger.warning(f"[TransactionFile] 파일 삭제 실패(기록은 지움): {path}")
    logger.debug(f"[TransactionFile] 삭제: tx_id={tx_id}, id={file_id}, by={current_user.id}")
    return _list(db, tx_id)
