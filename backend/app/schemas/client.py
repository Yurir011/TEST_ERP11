from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClientContactIn(BaseModel):
    name: str
    title: str | None = None
    landline_phone: str | None = None
    mobile_phone: str | None = None
    email: str | None = None
    memo: str | None = None


class ClientContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    title: str | None
    landline_phone: str | None
    mobile_phone: str | None
    email: str | None
    memo: str | None


class ClientCreate(BaseModel):
    name: str
    biz_reg_no: str | None = None
    ceo_name: str | None = None
    business_type: str | None = None
    phone: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    address: str | None = None
    receivable_amount: int = 0
    payable_amount: int = 0
    memo: str | None = None
    contacts: list[ClientContactIn] = Field(default_factory=list)


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    biz_reg_no: str | None
    ceo_name: str | None
    business_type: str | None
    phone: str | None
    bank_name: str | None
    bank_account: str | None
    address: str | None
    receivable_amount: int
    payable_amount: int
    memo: str | None
    contacts: list[ClientContactOut]
    created_at: datetime
    updated_at: datetime
