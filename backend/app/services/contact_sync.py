"""거래처 담당자 → 연락처 자동 등록.

거래처를 저장할 때, 담당자 중 휴대폰 번호가 있는 사람을 연락처에 넣는다.
- 같은 거래처에 같은 이름의 연락처가 이미 있으면 새로 만들지 않고 번호·직책·이메일만 맞춘다.
- 담당자를 거래처에서 지워도 연락처는 지우지 않는다 (직원이 따로 고친 내용을 잃지 않도록).
- 번호는 휴대폰 → phone, 유선 → phone2 (연락처는 번호 2개까지).
"""
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.client import Client
from app.models.contact import Contact

logger = get_logger("ContactSync")


def sync_client_contacts(db: Session, client: Client, user_id: int) -> int:
    """거래처 담당자의 휴대폰 번호를 연락처에 반영하고 새로 만든 건수를 돌려준다. client 는 id 가 있어야 한다(flush 후)."""
    created = 0
    existing = {c.name: c for c in db.query(Contact).filter(Contact.client_id == client.id).all()}
    for cc in client.contacts:
        mobile = (cc.mobile_phone or "").strip()
        name = (cc.name or "").strip()
        if not mobile or not name:
            continue
        landline = (cc.landline_phone or "").strip() or None
        contact = existing.get(name)
        if contact is None:
            contact = Contact(name=name, client_id=client.id, created_by=user_id)
            db.add(contact)
            existing[name] = contact
            created += 1
        contact.company_name = client.name
        contact.phone = mobile
        contact.phone2 = landline
        if cc.title:
            contact.title = cc.title
        if cc.email:
            contact.email = cc.email
    logger.debug(f"[ContactSync] 거래처 담당자 반영: client_id={client.id}, 새 연락처={created}건")
    return created
