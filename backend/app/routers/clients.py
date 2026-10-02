import os

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client, ClientContact
from app.models.user import User
from app.schemas.client import BusinessRegOcrOut, ClientCreate, ClientOut
from app.services.business_reg_ocr import recognize_business_registration
from app.services.client_list_excel import generate_client_list_excel

router = APIRouter(prefix="/api/clients", tags=["clients"])
logger = get_logger("Clients")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_BIZ_REG_FILE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}


def _is_korean_char(ch: str) -> bool:
    return "가" <= ch <= "힣" or "ㄱ" <= ch <= "ㅣ"  # 완성형 음절 + 자모


def _client_sort_key(client: Client) -> tuple[int, str]:
    """업체명 기준 가나다 사전식 정렬. 한글로 시작하는 업체를 먼저, 알파벳(그 외 문자)로 시작하는 업체는 맨 뒤로 보낸다."""
    name = client.name or ""
    first_char = name[0] if name else ""
    return (0 if _is_korean_char(first_char) else 1, name.lower())


def _apply_contacts(client: Client, contacts: list) -> None:
    client.contacts = [
        ClientContact(
            name=c.name,
            title=c.title,
            landline_phone=c.landline_phone,
            mobile_phone=c.mobile_phone,
            email=c.email,
            memo=c.memo,
            sort_order=i,
        )
        for i, c in enumerate(contacts)
    ]


def _build_client_query(db: Session, q: str | None):
    query = db.query(Client).options(joinedload(Client.contacts))
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Client.name.ilike(like),
                Client.biz_reg_no.ilike(like),
                Client.contacts.any(ClientContact.name.ilike(like)),
            )
        )
    return query


@router.get("", response_model=list[ClientOut])
def list_clients(
    q: str | None = Query(default=None, description="상호/담당자/사업자번호 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Clients] 목록 조회: user_id={current_user.id}, q={q}")
    clients = _build_client_query(db, q).all()
    clients.sort(key=_client_sort_key)
    return clients


@router.get("/export/excel")
def export_clients_excel(
    q: str | None = Query(default=None, description="상호/담당자/사업자번호 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clients = _build_client_query(db, q).all()
    clients.sort(key=_client_sort_key)
    logger.debug(f"[Clients] 목록 엑셀 내보내기: count={len(clients)}, q={q}, by={current_user.id}")
    excel_bytes = generate_client_list_excel(clients)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/ocr/business-registration", response_model=BusinessRegOcrOut)
def ocr_business_registration(
    file: UploadFile = File(...), current_user: User = Depends(get_current_user)
):
    """사업자등록증 이미지를 인식해 상호/사업자번호/대표자/주소/업태·업종을 추출한다(참조용 - 저장 전 반드시 확인 필요)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지 파일(jpg, png, webp)만 업로드할 수 있습니다.")

    raw = file.file.read()
    logger.debug(f"[Clients] 사업자등록증 인식 시도: filename={file.filename}, size={len(raw)}, by={current_user.id}")
    try:
        fields = recognize_business_registration(raw)
    except Exception as exc:  # noqa: BLE001
        logger.debug(f"[Clients] 사업자등록증 인식 실패: {exc}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지를 인식하지 못했습니다. 다른 사진으로 시도해주세요.")

    logger.debug(
        f"[Clients] 사업자등록증 인식 완료: name={fields.name}, biz_reg_no={fields.biz_reg_no}, by={current_user.id}"
    )
    return BusinessRegOcrOut(
        name=fields.name,
        biz_reg_no=fields.biz_reg_no,
        ceo_name=fields.ceo_name,
        address=fields.address,
        biz_type=fields.biz_type,
        biz_class=fields.biz_class,
        raw_text=fields.raw_text,
    )


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    client = db.query(Client).options(joinedload(Client.contacts)).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")
    return client


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    logger.debug(f"[Clients] 등록: name={payload.name}, contacts={len(payload.contacts)}, by={current_user.id}")
    data = payload.model_dump(exclude={"contacts"})
    client = Client(**data, created_by=current_user.id)
    _apply_contacts(client, payload.contacts)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).options(joinedload(Client.contacts)).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")

    for key, value in payload.model_dump(exclude={"contacts"}).items():
        setattr(client, key, value)
    _apply_contacts(client, payload.contacts)
    db.commit()
    db.refresh(client)
    logger.debug(f"[Clients] 수정: id={client_id}, contacts={len(payload.contacts)}, by={current_user.id}")
    return client


@router.post("/{client_id}/biz-reg-image", response_model=ClientOut)
def upload_biz_reg_image(
    client_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).options(joinedload(Client.contacts)).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")
    if file.content_type not in ALLOWED_BIZ_REG_FILE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미지(jpg, png, webp) 또는 PDF 파일만 업로드할 수 있습니다.")

    content = file.file.read()
    os.makedirs(settings.business_reg_images_dir, exist_ok=True)
    if client.biz_reg_image_path and os.path.exists(client.biz_reg_image_path):
        os.remove(client.biz_reg_image_path)
    ext = ALLOWED_BIZ_REG_FILE_TYPES[file.content_type]
    file_path = os.path.join(settings.business_reg_images_dir, f"{client.id}.{ext}")
    with open(file_path, "wb") as f:
        f.write(content)

    client.biz_reg_image_path = file_path
    db.commit()
    db.refresh(client)
    logger.debug(f"[Clients] 사업자등록증 첨부 업로드: client_id={client_id}, by={current_user.id}")
    return client


@router.get("/{client_id}/biz-reg-image")
def get_biz_reg_image(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None or not client.biz_reg_image_path or not os.path.exists(client.biz_reg_image_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사업자등록증 파일을 찾을 수 없습니다.")
    logger.debug(f"[Clients] 사업자등록증 첨부 조회: client_id={client_id}, by={current_user.id}")
    return FileResponse(client.biz_reg_image_path)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")
    if client.biz_reg_image_path and os.path.exists(client.biz_reg_image_path):
        os.remove(client.biz_reg_image_path)
    db.delete(client)
    db.commit()
    logger.debug(f"[Clients] 삭제: id={client_id}, by={current_user.id}")
    return None
