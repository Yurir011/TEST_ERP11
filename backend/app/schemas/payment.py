from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.payment import PaymentMethod, PaymentType


class PaymentCreate(BaseModel):
    type: PaymentType
    payment_date: date
    category: str
    description: str
    amount: int
    method: PaymentMethod = PaymentMethod.other
    client_id: int | None = None
    memo: str | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: PaymentType
    payment_date: date
    category: str
    description: str
    amount: int
    method: PaymentMethod
    client_id: int | None
    client_name: str | None
    has_receipt: bool
    memo: str | None
    created_at: datetime


class PaymentReportOut(BaseModel):
    year: int
    month: int
    total_deposit: int
    total_withdrawal: int
    net: int


class CsvImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
