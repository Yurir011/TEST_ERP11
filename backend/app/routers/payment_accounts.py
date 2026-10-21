"""법인카드·계좌 관리: 목록 조회(로그인한 직원 누구나), 추가·수정·삭제(관리자)."""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.payment_account import PaymentAccount
from app.models.user import User, is_admin_role
from app.schemas.payment_account import PaymentAccountCreate, PaymentAccountOut, PaymentAccountUpdate
from app.services.payment_accounts import list_accounts, usage_count

router = APIRouter(prefix="/api/payment-accounts", tags=["payment-accounts"])
logger = get_logger("PaymentAccounts")


def _out(db: Session, a: PaymentAccount) -> PaymentAccountOut:
    return PaymentAccountOut(
        id=a.id, kind=a.kind, code=a.code, nickname=a.nickname, issuer=a.issuer, last4=a.last4, pay_day=a.pay_day,
        is_active=a.is_active, in_use=usage_count(db, a) > 0, created_at=a.created_at,
    )


def _require_admin(user: User) -> None:
    if not is_admin_role(user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자만 카드·계좌를 관리할 수 있습니다.")


def _get_or_404(db: Session, account_id: int) -> PaymentAccount:
    account = db.get(PaymentAccount, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카드·계좌를 찾을 수 없습니다.")
    return account


@router.get("", response_model=list[PaymentAccountOut])
def get_payment_accounts(
    include_inactive: bool = Query(default=False, description="숨긴 카드·계좌도 포함 (옛 내역의 이름을 보여 줄 때)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accounts = list_accounts(db, active_only=not include_inactive)
    logger.debug(f"[PaymentAccounts] 목록 조회: count={len(accounts)}, inactive={include_inactive}, by={current_user.id}")
    return [_out(db, a) for a in accounts]


@router.post("", response_model=PaymentAccountOut, status_code=status.HTTP_201_CREATED)
def create_payment_account(payload: PaymentAccountCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    if payload.kind == "bank":
        payload.pay_day = None  # 결제일은 카드에만 쓴다
    last = db.query(PaymentAccount).filter(PaymentAccount.kind == payload.kind).count()
    account = PaymentAccount(
        kind=payload.kind,
        code=f"{payload.kind}_{secrets.token_hex(4)}",  # 새 수단의 고정 값 (이름을 바꿔도 내역과의 연결은 유지된다)
        nickname=payload.nickname,
        issuer=payload.issuer,
        last4=payload.last4,
        pay_day=payload.pay_day,
        sort_order=last + 1,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    logger.debug(f"[PaymentAccounts] 추가: id={account.id}, kind={account.kind}, nickname={account.nickname}, by={current_user.id}")
    return _out(db, account)


@router.put("/{account_id}", response_model=PaymentAccountOut)
def update_payment_account(account_id: int, payload: PaymentAccountUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    account = _get_or_404(db, account_id)
    account.nickname = payload.nickname
    account.issuer = payload.issuer
    account.last4 = payload.last4
    account.pay_day = payload.pay_day if account.kind == "card" else None
    account.is_active = payload.is_active
    db.commit()
    db.refresh(account)
    logger.debug(f"[PaymentAccounts] 수정: id={account_id}, active={account.is_active}, by={current_user.id}")
    return _out(db, account)


@router.delete("/{account_id}", response_model=PaymentAccountOut | None)
def delete_payment_account(account_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """사용 내역이 없으면 지우고(204 대신 null), 있으면 목록에서 숨긴다(숨김 처리된 수단을 돌려준다). 옛 내역의 이름은 그대로 보인다."""
    _require_admin(current_user)
    account = _get_or_404(db, account_id)
    if usage_count(db, account) > 0:
        account.is_active = False
        db.commit()
        db.refresh(account)
        logger.debug(f"[PaymentAccounts] 사용 내역이 있어 숨김: id={account_id}, by={current_user.id}")
        return _out(db, account)
    db.delete(account)
    db.commit()
    logger.debug(f"[PaymentAccounts] 삭제: id={account_id}, by={current_user.id}")
    return None
