from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


class ContactIn(BaseModel):
    name: str
    client_id: int | None = None  # 등록된 거래처를 고른 경우
    company_name: str | None = None  # 거래처가 아닌 회사 이름 (client_id 가 없을 때만 쓴다)
    title: str | None = None
    phone: str | None = None
    phone2: str | None = None
    email: str | None = None
    memo: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("이름을 입력해주세요.")
        return v

    @field_validator("company_name", "title", "phone", "phone2", "email", "memo")
    @classmethod
    def _opt(cls, v: str | None) -> str | None:
        return _clean(v)


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    client_id: int | None
    company: str | None  # 화면에 보이는 회사 이름 (거래처를 골랐으면 그 거래처명)
    title: str | None
    phone: str | None
    phone2: str | None
    email: str | None
    memo: str | None
    updated_at: datetime


class ClientOptionOut(BaseModel):
    id: int
    name: str


class ClientContactBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    title: str | None
    landline_phone: str | None
    mobile_phone: str | None
    email: str | None


class ClientSummaryOut(BaseModel):
    """연락처의 회사명을 눌렀을 때 뜨는 거래처 팝업 내용. 계좌·미수금 같은 금액 정보는 넣지 않는다 (거래처관리 권한이 없는 직원도 볼 수 있어서)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    ceo_name: str | None
    biz_type: str | None
    biz_class: str | None
    phone: str | None
    email: str | None
    address: str | None
    contacts: list[ClientContactBrief]
