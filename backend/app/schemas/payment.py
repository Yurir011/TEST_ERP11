from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.payment import (
    PAYMENT_CATEGORIES,
    PAYMENT_CATEGORY_ITEMS,
    PaymentMethod,
    PaymentType,
    ProofType,
)


class PaymentTransactionCandidateOut(BaseModel):
    """입출금으로 결제 처리할 수 있는 외상 매출/매입(매입매출관리에서 아직 결제완료되지 않은 내역)."""

    id: int
    transaction_date: date
    type: PaymentType  # 외상매출 → 입금, 외상매입 → 출금
    client_id: int | None
    client_name: str
    item_name: str
    total_amount: int
    tax_invoice_no: str | None


class PaymentCreate(BaseModel):
    type: PaymentType
    payment_date: date
    category: str
    description: str
    amount: int
    method: PaymentMethod = PaymentMethod.other
    client_id: int | None = None
    counterparty: str | None = None  # 등록되지 않은 거래처 이름 (client_id 가 없을 때 직접 입력한 이름)
    memo: str | None = None
    proof_type: ProofType | None = None
    proof_type_detail: str | None = None
    card_type: str | None = None  # 법인카드 code (카드·계좌 관리에 등록된 것)
    bank_type: str | None = None  # 계좌 code
    # 새 입출금 등록 시 불러온 외상 매출/매입(매입매출 내역). 지정하면 그 내역이 결제완료로 바뀌고 이 입출금의 날짜가 완료일로 기록된다.
    transaction_id: int | None = None

    @model_validator(mode="after")
    def _validate_proof(self):
        # 계좌이체·현금이 아니면 증빙 정보를 저장하지 않는다.
        if self.method not in (PaymentMethod.bank_transfer, PaymentMethod.cash):
            self.proof_type = None
            self.proof_type_detail = None
            return self

        if self.proof_type == ProofType.other:
            if not self.proof_type_detail or not self.proof_type_detail.strip():
                raise ValueError("증빙 종류를 '기타'로 선택한 경우 내용을 입력해주세요.")
        else:
            self.proof_type_detail = None
        return self

    @model_validator(mode="after")
    def _validate_method_detail(self):
        if self.method == PaymentMethod.corporate_card:
            if self.card_type is None:
                raise ValueError("카드 종류를 선택해주세요.")
            self.bank_type = None
        elif self.method == PaymentMethod.bank_transfer:
            if self.bank_type is None:
                raise ValueError("계좌 종류를 선택해주세요.")
            self.card_type = None
        else:
            self.card_type = None
            self.bank_type = None
        return self

    @model_validator(mode="after")
    def _validate_category(self):
        if self.category not in PAYMENT_CATEGORIES:
            raise ValueError(f"알 수 없는 분류입니다: {self.category}")

        if not self.description or not self.description.strip():
            raise ValueError("내용을 선택하거나 입력해주세요.")

        # 항목이 고정 목록이고 "기타"가 없는 분류(제조)는 목록에 있는 값만 허용한다.
        # "기타"가 포함된 분류(인건비/차량)는 자유 입력을 허용하므로 값 자체는 검증하지 않는다.
        allowed_items = PAYMENT_CATEGORY_ITEMS.get(self.category)
        if allowed_items and "기타" not in allowed_items and self.description not in allowed_items:
            raise ValueError(f"'{self.category}' 분류의 항목은 {', '.join(allowed_items)} 중에서 선택해야 합니다.")
        return self


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
    proof_type: ProofType | None
    proof_type_detail: str | None
    card_type: str | None
    bank_type: str | None
    card_pending: bool = False
    card_used_date: date | None = None
    # 이 입출금으로 결제완료 처리된 매입매출의 거래일(미수금/미지급금 발생일). 연결된 내역이 없으면 None.
    occurred_date: date | None = None
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


class CardPendingSummaryOut(BaseModel):
    card_type: str
    count: int
    total_amount: int
    oldest_used_date: date | None
    newest_used_date: date | None
    default_settle_date: date  # 다음에 처리할 카드 결제일 (휴일이면 다음 영업일)
    usage_from: date  # 그 결제일에 청구되는 사용기간
    usage_to: date
    later_count: int  # 사용기간 이후라 다음 결제일로 넘어가는 결제예정 건수
    later_amount: int


class CardSettleIn(BaseModel):
    card_type: str
    settle_date: date


class CardSettleOut(BaseModel):
    settled_count: int
    total_amount: int
