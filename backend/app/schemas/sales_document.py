from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.sales_document import SalesDocType


class SalesDocumentItemIn(BaseModel):
    name: str
    spec: str | None = None
    quantity: int = Field(gt=0)
    unit_price: int = Field(ge=0)


class SalesDocumentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    spec: str | None
    quantity: int
    unit_price: int
    amount: int


class SalesDocumentSetCreate(BaseModel):
    """견적서와 거래명세서를 한 번에 같은 내용·같은 일련번호로 생성한다."""

    project_id: int
    issue_date: date
    notes: str | None = None
    items: list[SalesDocumentItemIn]


class SalesDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str
    client_name: str
    set_id: int
    doc_type: SalesDocType
    doc_no: str
    issue_date: date
    notes: str | None
    subtotal: int
    vat: int
    total: int
    created_at: datetime
    items: list[SalesDocumentItemOut]


class SalesDocumentSetOut(BaseModel):
    set_id: int
    estimate: SalesDocumentOut
    statement: SalesDocumentOut
