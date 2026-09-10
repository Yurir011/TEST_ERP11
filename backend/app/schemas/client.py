from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ClientCreate(BaseModel):
    name: str
    biz_reg_no: str | None = None
    ceo_name: str | None = None
    business_type: str | None = None
    phone: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    address: str | None = None
    receivable_amount: int = 0
    payable_amount: int = 0
    memo: str | None = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    biz_reg_no: str | None
    ceo_name: str | None
    business_type: str | None
    phone: str | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    bank_name: str | None
    bank_account: str | None
    address: str | None
    receivable_amount: int
    payable_amount: int
    memo: str | None
    created_at: datetime
    updated_at: datetime
