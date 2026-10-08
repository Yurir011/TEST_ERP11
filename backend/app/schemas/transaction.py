from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.transaction import TransactionType


class TransactionCreate(BaseModel):
    type: TransactionType
    transaction_date: date
    client_id: int | None = None
    counterparty: str | None = None
    item_name: str
    supply_amount: int
    vat_amount: int
    tax_invoice_no: str | None = None
    memo: str | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: TransactionType
    transaction_date: date
    client_id: int | None
    client_name: str | None
    counterparty: str | None
    item_name: str
    supply_amount: int
    vat_amount: int
    total_amount: int
    tax_invoice_no: str | None
    memo: str | None
    created_at: datetime


class HometaxPreviewRow(BaseModel):
    approval_no: str
    transaction_date: date | None
    type: TransactionType | None
    counterparty_name: str
    counterparty_reg_no: str
    item_name: str
    supply_amount: int
    vat_amount: int
    status: str  # new | duplicate | error
    message: str
    client_action: str  # existing | create | create_same | none


class HometaxPreviewOut(BaseModel):
    company_reg_no: str
    total: int
    new_count: int
    duplicate_count: int
    error_count: int
    new_client_count: int
    rows: list[HometaxPreviewRow]


class HometaxImportResult(BaseModel):
    imported: int
    skipped_duplicates: int
    errors: int
    created_clients: int
    created_documents: int = 0


class VatReportOut(BaseModel):
    year: int
    month: int
    sales_supply: int
    sales_vat: int
    purchase_supply: int
    purchase_vat: int
    payable_vat: int
