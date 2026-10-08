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
    biz_type: str | None = None
    biz_class: str | None = None
    phone: str | None = None
    email: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    address: str | None = None
    receivable_amount: int = 0
    payable_amount: int = 0
    memo: str | None = None
    contacts: list[ClientContactIn] = Field(default_factory=list)


class BusinessRegOcrOut(BaseModel):
    """사업자등록증 이미지 인식(OCR) 결과. 로컬 OCR 특성상 완벽하지 않을 수 있어 사용자가 반드시 값을 확인해야 한다."""

    name: str | None = None
    biz_reg_no: str | None = None
    ceo_name: str | None = None
    address: str | None = None
    biz_type: str | None = None
    biz_class: str | None = None
    raw_text: str = ""


class BankbookOcrOut(BaseModel):
    """통장사본 이미지 인식(OCR) 결과. 사용자가 반드시 값을 확인해야 한다. holder(예금주)는 거래처명과 비교하는 참고용이다."""

    bank_name: str | None = None
    bank_account: str | None = None
    holder: str | None = None
    raw_text: str = ""


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    biz_reg_no: str | None
    ceo_name: str | None
    biz_type: str | None
    biz_class: str | None
    phone: str | None
    email: str | None
    bank_name: str | None
    bank_account: str | None
    address: str | None
    receivable_amount: int
    payable_amount: int
    memo: str | None
    has_biz_reg_image: bool
    has_biz_reg_image2: bool
    has_bankbook_image: bool
    contacts: list[ClientContactOut]
    created_at: datetime
    updated_at: datetime
