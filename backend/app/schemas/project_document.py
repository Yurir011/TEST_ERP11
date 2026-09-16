from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.project_document import MAX_ITEMS, ProjectDocType


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


class ProjectDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str
    doc_type: ProjectDocType
    issue_date: date
    client_name: str
    manager_name: str | None
    items: list[ProjectDocumentItemOut]
    has_excel: bool
    created_by: int
    created_at: datetime
