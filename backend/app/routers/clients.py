from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client, ClientContact
from app.models.user import User
from app.schemas.client import ClientCreate, ClientOut

router = APIRouter(prefix="/api/clients", tags=["clients"])
logger = get_logger("Clients")


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


@router.get("", response_model=list[ClientOut])
def list_clients(
    q: str | None = Query(default=None, description="상호/담당자/사업자번호 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Clients] 목록 조회: user_id={current_user.id}, q={q}")
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
    clients = query.all()
    clients.sort(key=_client_sort_key)
    return clients


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


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")
    db.delete(client)
    db.commit()
    logger.debug(f"[Clients] 삭제: id={client_id}, by={current_user.id}")
    return None
