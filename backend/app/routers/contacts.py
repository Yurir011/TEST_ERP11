"""연락처: 전 직원이 함께 쓰는 주소록 (PC·모바일 공용). 로그인한 직원 누구나 조회·추가·수정·삭제한다."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.client import Client
from app.models.contact import Contact
from app.models.user import User
from app.schemas.contact import ClientOptionOut, ClientSummaryOut, ContactIn, ContactOut

router = APIRouter(prefix="/api/contacts", tags=["contacts"])
logger = get_logger("Contacts")


def _out(c: Contact) -> ContactOut:
    return ContactOut(
        id=c.id,
        name=c.name,
        client_id=c.client_id,
        company=c.client.name if c.client else c.company_name,
        title=c.title,
        phone=c.phone,
        phone2=c.phone2,
        email=c.email,
        memo=c.memo,
        updated_at=c.updated_at,
    )


def _apply(db: Session, c: Contact, payload: ContactIn) -> None:
    client = None
    if payload.client_id is not None:
        client = db.get(Client, payload.client_id)
        if client is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="존재하지 않는 거래처입니다.")
    c.name = payload.name
    c.client_id = client.id if client else None
    # 거래처를 골랐으면 그 이름을 같이 적어 둔다 (나중에 거래처가 지워져도 회사 이름은 남도록)
    c.company_name = client.name if client else payload.company_name
    c.title = payload.title
    c.phone = payload.phone
    c.phone2 = payload.phone2
    c.email = payload.email
    c.memo = payload.memo


def _get_or_404(db: Session, contact_id: int) -> Contact:
    c = db.query(Contact).options(joinedload(Contact.client)).filter(Contact.id == contact_id).first()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연락처를 찾을 수 없습니다.")
    return c


@router.get("", response_model=list[ContactOut])
def list_contacts(
    q: str | None = Query(default=None, description="이름/회사/직책/번호/메모 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Contact).options(joinedload(Contact.client)).outerjoin(Client, Contact.client_id == Client.id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds = [
            Contact.name.ilike(like),
            Contact.company_name.ilike(like),
            Client.name.ilike(like),
            Contact.title.ilike(like),
            Contact.email.ilike(like),
            Contact.memo.ilike(like),
            Contact.phone.ilike(like),
            Contact.phone2.ilike(like),
        ]
        digits = "".join(ch for ch in q if ch.isdigit())
        if len(digits) >= 3:  # 하이픈 없이 숫자만 쳐도 찾는다
            # 저장된 번호의 하이픈·공백을 빼고 비교한다
            for col in (Contact.phone, Contact.phone2):
                conds.append(func.regexp_replace(col, "[^0-9]", "", "g").like(f"%{digits}%"))
        query = query.filter(or_(*conds))
    contacts = query.order_by(Contact.name).all()
    logger.debug(f"[Contacts] 목록 조회: q={q!r}, count={len(contacts)}, by={current_user.id}")
    return [_out(c) for c in contacts]


@router.get("/client-options", response_model=list[ClientOptionOut])
def client_options(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """연락처의 회사 칸에서 고를 거래처 목록 (거래처관리 권한이 없어도 이름은 볼 수 있다)."""
    rows = db.query(Client.id, Client.name).order_by(Client.name).all()
    logger.debug(f"[Contacts] 거래처 선택 목록: count={len(rows)}, by={current_user.id}")
    return [ClientOptionOut(id=r.id, name=r.name) for r in rows]


@router.get("/clients/{client_id}", response_model=ClientSummaryOut)
def client_summary(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    client = db.query(Client).options(joinedload(Client.contacts)).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래처를 찾을 수 없습니다.")
    logger.debug(f"[Contacts] 거래처 팝업 조회: client_id={client_id}, by={current_user.id}")
    return client


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(payload: ContactIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = Contact(created_by=current_user.id)
    _apply(db, c, payload)
    db.add(c)
    db.commit()
    c = _get_or_404(db, c.id)
    logger.debug(f"[Contacts] 추가: id={c.id}, name={c.name}, client_id={c.client_id}, by={current_user.id}")
    return _out(c)


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: int, payload: ContactIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = _get_or_404(db, contact_id)
    _apply(db, c, payload)
    db.commit()
    c = _get_or_404(db, contact_id)
    logger.debug(f"[Contacts] 수정: id={contact_id}, by={current_user.id}")
    return _out(c)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = _get_or_404(db, contact_id)
    db.delete(c)
    db.commit()
    logger.debug(f"[Contacts] 삭제: id={contact_id}, by={current_user.id}")
