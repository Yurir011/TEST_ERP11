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
    # 새 거래 등록 시 불러온 세금계산서 문서. 지정하면 그 문서를 이 거래와 연결해 같은 세금계산서가 매입매출에 두 번 잡히지 않게 한다.
    tax_invoice_doc_id: int | None = None
    # 결제 상태. 기본은 외상(False). 결제완료(True)면 완료일을 함께 기록한다(비우면 오늘).
    settled: bool = False
    settled_date: date | None = None


class TaxInvoiceCandidateOut(BaseModel):
    """매입매출에 아직 연결되지 않은 세금계산서 문서(불러오기 후보)."""

    id: int
    issue_date: date
    type: TransactionType
    client_id: int | None
    client_name: str
    item_name: str
    supply_amount: int
    vat_amount: int
    tax_invoice_no: str | None
    status: str


class TransactionPaymentOut(BaseModel):
    """매입매출 한 건에 대한 부분 수금/지급 내역 (마지막에 전액을 채운 결제 포함)."""

    id: int
    payment_date: date
    amount: int
    method: str


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
    settled: bool
    settled_date: date | None
    paid_amount: int = 0  # 부분 수금/지급으로 이미 받은(준) 금액. 미결제 금액 = total_amount - paid_amount
    payment_history: list[TransactionPaymentOut] = []  # 부분 수금/지급 내역 (오래된 순)
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


class HometaxSkippedRow(BaseModel):
    approval_no: str
    transaction_date: date | None
    type: TransactionType | None
    counterparty_name: str
    item_name: str
    supply_amount: int
    vat_amount: int
    message: str


class HometaxImportResult(BaseModel):
    imported: int
    skipped_duplicates: int
    errors: int
    created_clients: int
    created_documents: int = 0
    duplicates: list[HometaxSkippedRow] = []
    error_rows: list[HometaxSkippedRow] = []


class VatReportOut(BaseModel):
    year: int
    month: int
    sales_supply: int
    sales_vat: int
    purchase_supply: int
    purchase_vat: int
    payable_vat: int
