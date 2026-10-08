from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.deps import require_menu_access
from app.database import get_db
from app.logging_config import get_logger
from app.models.payment import PaymentMethod
from app.models.recurring_payment import RecurringPayment
from app.models.user import User
from app.schemas.payment import PaymentCreate
from app.schemas.recurring_payment import RecurringPaymentCreate, RecurringPaymentOut
from app.services.recurring_payment import generate_recurring_payments

router = APIRouter(prefix="/api/recurring-payments", tags=["recurring-payments"])
logger = get_logger("RecurringPayments")

require_payments_access = require_menu_access("payments")


def _to_out(t: RecurringPayment) -> RecurringPaymentOut:
    last = max((r.year_month for r in t.runs), default=None)
    return RecurringPaymentOut(
        id=t.id,
        type=t.type,
        category=t.category,
        description=t.description,
        amount=t.amount,
        day_of_month=t.day_of_month,
        start_month=t.start_month,
        bank_type=t.bank_type,
        memo=t.memo,
        is_active=t.is_active,
        last_recorded_month=last,
        created_at=t.created_at,
    )


def _validate_like_payment(payload: RecurringPaymentCreate) -> None:
    """분류/항목 규칙은 일반 입출금 등록과 동일하게 검사한다."""
    try:
        PaymentCreate(
            type=payload.type,
            payment_date=date.today(),
            category=payload.category,
            description=payload.description,
            amount=payload.amount,
            method=PaymentMethod.bank_transfer,
            bank_type=payload.bank_type,
        )
    except ValidationError as exc:
        message = "; ".join(str(e["msg"]).removeprefix("Value error, ") for e in exc.errors())
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc


def _get_or_404(db: Session, template_id: int) -> RecurringPayment:
    tpl = db.query(RecurringPayment).filter(RecurringPayment.id == template_id).first()
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="정기 자동이체 항목을 찾을 수 없습니다.")
    return tpl


@router.get("", response_model=list[RecurringPaymentOut])
def list_recurring(db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    generate_recurring_payments(db)
    items = db.query(RecurringPayment).order_by(RecurringPayment.day_of_month, RecurringPayment.id).all()
    logger.debug(f"[RecurringPayments] 목록 조회: {len(items)}건, by={current_user.id}")
    return [_to_out(t) for t in items]


@router.post("", response_model=RecurringPaymentOut, status_code=status.HTTP_201_CREATED)
def create_recurring(
    payload: RecurringPaymentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)
):
    _validate_like_payment(payload)
    tpl = RecurringPayment(
        type=payload.type,
        category=payload.category,
        description=payload.description.strip(),
        amount=payload.amount,
        day_of_month=payload.day_of_month,
        start_month=payload.start_month.replace(day=1),
        bank_type=payload.bank_type,
        memo=payload.memo,
        is_active=payload.is_active,
        created_by=current_user.id,
    )
    db.add(tpl)
    db.commit()
    logger.debug(f"[RecurringPayments] 등록: id={tpl.id}, {payload.description}, 매월 {payload.day_of_month}일, by={current_user.id}")
    generate_recurring_payments(db)
    db.refresh(tpl)
    return _to_out(tpl)


@router.put("/{template_id}", response_model=RecurringPaymentOut)
def update_recurring(
    template_id: int,
    payload: RecurringPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_payments_access),
):
    _validate_like_payment(payload)
    tpl = _get_or_404(db, template_id)
    tpl.type = payload.type
    tpl.category = payload.category
    tpl.description = payload.description.strip()
    tpl.amount = payload.amount
    tpl.day_of_month = payload.day_of_month
    tpl.start_month = payload.start_month.replace(day=1)
    tpl.bank_type = payload.bank_type
    tpl.memo = payload.memo
    tpl.is_active = payload.is_active
    db.commit()
    logger.debug(f"[RecurringPayments] 수정: id={template_id}, active={payload.is_active}, by={current_user.id}")
    generate_recurring_payments(db)
    db.refresh(tpl)
    return _to_out(tpl)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_payments_access)):
    tpl = _get_or_404(db, template_id)
    db.delete(tpl)  # 이미 기록된 입출금 내역은 그대로 남는다.
    db.commit()
    logger.debug(f"[RecurringPayments] 삭제: id={template_id}, by={current_user.id}")
    return None
