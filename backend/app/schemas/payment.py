from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.payment import PAYMENT_CATEGORIES, PAYMENT_CATEGORY_ITEMS, PaymentMethod, PaymentType, ProofType


class PaymentCreate(BaseModel):
    type: PaymentType
    payment_date: date
    category: str
    description: str
    amount: int
    method: PaymentMethod = PaymentMethod.other
    client_id: int | None = None
    memo: str | None = None
    proof_type: ProofType | None = None
    proof_type_detail: str | None = None

    @model_validator(mode="after")
    def _validate_proof(self):
        # 계좌이체가 아니면 증빙 정보를 저장하지 않는다.
        if self.method != PaymentMethod.bank_transfer:
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
