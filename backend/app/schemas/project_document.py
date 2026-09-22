from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.project_document import MAX_ITEMS, DocCurrency, ProjectDocType, ProjectDocumentStatus, TaxInvoicePurpose


class ProjectDocumentItemIn(BaseModel):
    content: str
    quantity: int
    unit_price: int
    note: str | None = None


class ProjectDocumentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    quantity: int
    unit_price: int
    note: str | None


class ProjectDocumentCreate(BaseModel):
    project_id: int
    doc_type: ProjectDocType
    issue_date: date
    currency: DocCurrency = DocCurrency.KRW
    purpose_type: TaxInvoicePurpose = TaxInvoicePurpose.billing
    client_name: str
    manager_name: str | None = None
    items: list[ProjectDocumentItemIn] = Field(default_factory=list)
    approver_id: int

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[ProjectDocumentItemIn]) -> list[ProjectDocumentItemIn]:
        if not v:
            raise ValueError("항목을 1개 이상 입력해주세요.")
        if len(v) > MAX_ITEMS:
            raise ValueError(f"항목은 최대 {MAX_ITEMS}개까지 입력할 수 있습니다.")
        return v


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

    approver_id: int


class RejectIn(BaseModel):
    reason: str


class ProjectDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
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
    status: ProjectDocumentStatus
    approver_id: int | None
    approver_name: str | None
    reviewed_at: datetime | None
    reject_reason: str | None
    client_contact_email: str | None
    created_by: int
    created_at: datetime
    popbill_issued: bool
    popbill_nts_confirm_num: str | None
    popbill_issued_at: datetime | None


class PopbillIssueOut(BaseModel):
    nts_confirm_num: str
    issued_at: datetime
