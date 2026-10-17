from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import record_event
from app.core.deps import require_admin_or_site_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.nfc_card import NfcCard
from app.models.user import User
from app.schemas.nfc import NfcCardCreate, NfcCardOut
from app.services.nfc import uid_hash, uid_last4

router = APIRouter(prefix="/api/users", tags=["nfc-cards"])
logger = get_logger("NFC")

MAX_CARDS_PER_USER = 5  # 분실·교체를 감안한 상한


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="직원을 찾을 수 없습니다.")
    return user


def _get_card(db: Session, user_id: int, card_id: int) -> NfcCard:
    card = db.get(NfcCard, card_id)
    if card is None or card.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카드를 찾을 수 없습니다.")
    return card


@router.get("/{user_id}/nfc-cards", response_model=list[NfcCardOut])
def list_cards(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    _get_user(db, user_id)
    return db.query(NfcCard).filter(NfcCard.user_id == user_id).order_by(NfcCard.id).all()


@router.post("/{user_id}/nfc-cards", response_model=NfcCardOut, status_code=status.HTTP_201_CREATED)
def register_card(
    user_id: int,
    payload: NfcCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_site_admin),
):
    user = _get_user(db, user_id)
    logger.debug(f"[NFC] 카드 등록 시도: user_id={user_id}, by={current_user.id}")
    if db.query(NfcCard).filter(NfcCard.user_id == user_id).count() >= MAX_CARDS_PER_USER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"카드는 직원 한 명당 {MAX_CARDS_PER_USER}장까지 등록할 수 있습니다.")

    hashed = uid_hash(payload.uid)
    owner = db.query(NfcCard).filter(NfcCard.uid_hmac == hashed).first()
    if owner is not None:
        who = db.get(User, owner.user_id)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"이 카드는 이미 {who.name if who else '다른 직원'}님에게 등록되어 있어 등록할 수 없습니다.")

    card = NfcCard(user_id=user_id, uid_hmac=hashed, uid_last4=uid_last4(payload.uid), label=payload.label, registered_by=current_user.id)
    db.add(card)
    db.flush()
    record_event(db, "nfc_card_registered", "nfc_card", card.id, f"{user.name}님 NFC 카드 등록 (끝 4자리 {card.uid_last4}, {card.label or '이름 없음'})")
    db.commit()
    db.refresh(card)
    logger.info(f"[NFC] 카드 등록: card_id={card.id}, user_id={user_id}, 끝 4자리={card.uid_last4}")
    return card


@router.put("/{user_id}/nfc-cards/{card_id}/deactivate", response_model=NfcCardOut)
def deactivate_card(
    user_id: int, card_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)
):
    user = _get_user(db, user_id)
    card = _get_card(db, user_id, card_id)
    if card.is_active:
        card.is_active = False
        card.deactivated_at = datetime.now(timezone.utc)
        record_event(db, "nfc_card_deactivated", "nfc_card", card.id, f"{user.name}님 NFC 카드 사용 중지 (끝 4자리 {card.uid_last4})")
        db.commit()
        db.refresh(card)
        logger.info(f"[NFC] 카드 사용 중지: card_id={card.id}")
    return card


@router.delete("/{user_id}/nfc-cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(user_id: int, card_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    """카드를 완전히 지운다 (다른 직원에게 다시 등록할 수 있게 된다)."""
    user = _get_user(db, user_id)
    card = _get_card(db, user_id, card_id)
    record_event(db, "nfc_card_deleted", "nfc_card", card.id, f"{user.name}님 NFC 카드 삭제 (끝 4자리 {card.uid_last4})")
    db.delete(card)
    db.commit()
    logger.info(f"[NFC] 카드 삭제: card_id={card_id}")
