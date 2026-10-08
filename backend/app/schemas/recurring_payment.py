from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.payment import BankType, PaymentType


class RecurringPaymentCreate(BaseModel):
    type: PaymentType = PaymentType.withdrawal
    category: str
    description: str
    amount: int = Field(gt=0)
    day_of_month: int = Field(ge=1, le=31)
    start_month: date  # 첫 자동이체 월 (날짜는 무시하고 해당 월 1일로 저장)
    bank_type: BankType
    memo: str | None = None
    is_active: bool = True


class RecurringPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: PaymentType
    category: str
    description: str
    amount: int
    day_of_month: int
    start_month: date
    bank_type: BankType
    memo: str | None
    is_active: bool
    last_recorded_month: str | None  # 가장 최근에 기록된 월 ("2026-10")
    created_at: datetime
