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


class PaymentAccountUpdate(PaymentAccountBase):
    is_active: bool = True


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
    created_at: datetime
