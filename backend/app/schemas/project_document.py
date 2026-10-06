from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.project_document import MAX_ITEMS, DocCurrency, ProjectDocType, ProjectDocumentStatus, TaxInvoicePurpose
from app.models.user import JobTitle
from app.schemas.approval import ApprovalStepOut


class ProjectDocumentItemIn(BaseModel):
    content: str
    quantity: int
    unit_price: float = Field(ge=0)
    note: str | None = None


class ProjectDocumentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    quantity: int
    unit_price: float
    note: str | None


class ProjectDocumentImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str


class TaxInvoicePartyOut(BaseModel):
    reg_no: str | None
    name: str | None
    ceo_name: str | None
    address: str | None
    biz_type: str | None
    biz_class: str | None
    email: str | None


class TaxInvoicePartyIn(BaseModel):
    """작성 화면이 사진 인식 결과 중 상대방(거래처) 정보를 문서에 함께 저장하라고 보낼 때 사용."""

    reg_no: str | None = None
    name: str | None = None
    ceo_name: str | None = None
    address: str | None = None
    biz_type: str | None = None
    biz_class: str | None = None
    email: str | None = None


class TaxInvoiceOcrItemOut(BaseModel):
    content: str
    spec: str | None
    quantity: float
    unit_price: float
    supply_amount: int
    vat_amount: int


class TaxInvoiceOcrOut(BaseModel):
    """세금계산서 사진 인식 결과. 화면 입력란을 미리 채우는 용도이며 사용자 확인/수정을 거쳐 저장한다."""

    approval_no: str | None
    issue_date: date | None
    supplier: TaxInvoicePartyOut
    recipient: TaxInvoicePartyOut
    supply_amount: int | None
    vat_amount: int | None
    total_amount: int | None
    items: list[TaxInvoiceOcrItemOut]
    direction: str | None  # "sales"(공급자가 우리 회사) / "purchase"(공급받는자가 우리 회사) / None(판별 불가)
    counterparty_name: str | None  # 우리 회사가 아닌 상대방 상호
    warnings: list[str]


class ProjectDocumentCreate(BaseModel):
    project_id: int | None = None  # None이면 "기타" - project_other_name 필수
    project_other_name: str | None = None
    doc_type: ProjectDocType
    issue_date: date
    currency: DocCurrency = DocCurrency.KRW
    purpose_type: TaxInvoicePurpose = TaxInvoicePurpose.billing
    client_name: str
    manager_name: str | None = None
    items: list[ProjectDocumentItemIn] = Field(default_factory=list)
    is_final_decision: bool = False
    end_title: JobTitle | None = None
    approver_ids: list[int] = Field(default_factory=list)
    received: bool | None = None  # 세금계산서 작성 시점에 물어보는 입금(청구)/지급(영수) 확인 여부
    direction: str | None = None  # 세금계산서 등록: "sales" / "purchase" (사진 인식으로 판별된 값)
    approval_no: str | None = None  # 세금계산서 등록: 국세청 승인번호
    counterparty: TaxInvoicePartyIn | None = None  # 세금계산서 등록: 사진에서 인식한 상대방 정보

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[ProjectDocumentItemIn]) -> list[ProjectDocumentItemIn]:
        if not v:
            raise ValueError("항목을 1개 이상 입력해주세요.")
        if len(v) > MAX_ITEMS:
            raise ValueError(f"항목은 최대 {MAX_ITEMS}개까지 입력할 수 있습니다.")
        return v

    @model_validator(mode="after")
    def validate_project(self):
        if self.project_id is None:
            self.project_other_name = (self.project_other_name or "").strip() or None
            if not self.project_other_name:
                raise ValueError("관련 프로젝트를 선택하거나 '기타' 내용을 입력해주세요.")
        else:
            self.project_other_name = None
        return self

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, v: str | None) -> str | None:
        if v not in (None, "sales", "purchase"):
            raise ValueError("direction은 sales 또는 purchase여야 합니다.")
        return v


class ProjectDocumentSetCreate(ProjectDocumentCreate):
    """견적서+거래명세서 동시 작성. doc_type은 무시되고 항상 견적서/거래명세서 한 쌍이 만들어진다."""

    doc_type: ProjectDocType = ProjectDocType.quotation


class ProjectDocumentUpdate(BaseModel):
    """반려된 문서를 재수정할 때 사용 (draft/rejected 상태에서만 허용)."""

    issue_date: date
    currency: DocCurrency = DocCurrency.KRW
    purpose_type: TaxInvoicePurpose = TaxInvoicePurpose.billing
    client_name: str
    manager_name: str | None = None
    items: list[ProjectDocumentItemIn] = Field(default_factory=list)

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[ProjectDocumentItemIn]) -> list[ProjectDocumentItemIn]:
        if not v:
            raise ValueError("항목을 1개 이상 입력해주세요.")
        if len(v) > MAX_ITEMS:
            raise ValueError(f"항목은 최대 {MAX_ITEMS}개까지 입력할 수 있습니다.")
        return v


class ApprovalRequestIn(BaseModel):
    """반려된 문서를 다시 결재 요청할 때 사용."""

    is_final_decision: bool = False
    end_title: JobTitle | None = None
    approver_ids: list[int] = Field(default_factory=list)
    received: bool | None = None  # 세금계산서 재요청 시점에 물어보는 입금(청구)/지급(영수) 확인 여부


class RejectIn(BaseModel):
    reason: str


class TaxInvoicePaymentConfirm(BaseModel):
    """세금계산서 승인 직후 입금(청구)/지급(영수) 여부를 확인할 때 사용."""

    received: bool


class ProjectDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int | None
    project_name: str
    doc_type: ProjectDocType
    issue_date: date
    doc_no: str | None
    currency: DocCurrency
    purpose_type: TaxInvoicePurpose
    client_name: str
    manager_name: str | None
    items: list[ProjectDocumentItemOut]
    has_pdf: bool
    has_excel: bool
    set_id: int | None = None
    status: ProjectDocumentStatus
    current_step: int
    steps: list[ApprovalStepOut]
    approver_id: int | None
    approver_name: str | None
    is_final_decision: bool
    reviewed_at: datetime | None
    reject_reason: str | None
    client_contact_email: str | None
    created_by: int
    created_at: datetime
    popbill_issued: bool
    popbill_nts_confirm_num: str | None
    popbill_issued_at: datetime | None
    payment_recorded: bool
    direction: str | None = None
    approval_no: str | None = None
    images: list[ProjectDocumentImageOut] = Field(default_factory=list)


class PopbillIssueOut(BaseModel):
    nts_confirm_num: str
    issued_at: datetime
