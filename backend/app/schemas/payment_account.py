from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PaymentAccountBase(BaseModel):
    nickname: str = Field(min_length=1, max_length=50)  # 평소 화면에 보이는 이름(별명)
    issuer: str = Field(min_length=1, max_length=50)  # 카드사 / 은행
    last4: str | None = None  # 뒤 4자리 (숫자)
    pay_day: int | None = Field(default=None, ge=1, le=31)  # 카드 결제일

    @field_validator("nickname", "issuer")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("비워 둘 수 없습니다.")
        return v

    @field_validator("last4")
    @classmethod
    def _four_digits(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not (len(v) == 4 and v.isdigit()):
            raise ValueError("뒤 4자리는 숫자 4개로 입력해주세요.")
        return v


class PaymentAccountCreate(PaymentAccountBase):
    kind: Literal["card", "bank"]
    owner_user_id: int | None = None  # 법인카드 소유 직원 (카드만, 관리자가 지정)


class PaymentAccountUpdate(PaymentAccountBase):
    is_active: bool = True
    owner_user_id: int | None = None


class DelegatesIn(BaseModel):
    user_ids: list[int] = Field(default_factory=list)  # 사용 내역 등록·수정을 허용할 직원


class StaffOut(BaseModel):
    id: int
    name: str


class PaymentAccountOut(BaseModel):
    id: int
    kind: str
    code: str
    nickname: str
    issuer: str
    last4: str | None
    pay_day: int | None
    is_active: bool
    in_use: bool = False  # 입출금 등에서 쓴 적이 있어 지우면 숨김 처리된다
    owner_user_id: int | None = None  # 법인카드 소유 직원 (없으면 공용 카드)
    owner_name: str | None = None
    delegate_ids: list[int] = Field(default_factory=list)  # 사용을 허용받은 직원
    can_use: bool = True  # 지금 로그인한 직원이 이 카드로 내역을 등록·수정할 수 있는가
    can_manage: bool = False  # 지금 로그인한 직원이 사용 권한을 허용·회수할 수 있는가 (소유 직원·관리자)
    created_at: datetime
