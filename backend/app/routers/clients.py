from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.user import User
from app.schemas.client import ClientCreate, ClientOut

router = APIRouter(prefix="/api/clients", tags=["clients"])
logger = get_logger("Clients")


@router.get("", response_model=list[ClientOut])
def list_clients(
    q: str | None = Query(default=None, description="상호/담당자/사업자번호 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Clients] 목록 조회: user_id={current_user.id}, q={q}")
    query = db.query(Client)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Client.name.ilike(like), Client.contact_name.ilike(like), Client.biz_reg_no.ilike(like))
        )
    return query.order_by(Client.name).all()


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")
    return client


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    logger.debug(f"[Clients] 등록: name={payload.name}, by={current_user.id}")
    client = Client(**payload.model_dump(), created_by=current_user.id)
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
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")

    for key, value in payload.model_dump().items():
        setattr(client, key, value)
    db.commit()
    db.refresh(client)
    logger.debug(f"[Clients] 수정: id={client_id}, by={current_user.id}")
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
