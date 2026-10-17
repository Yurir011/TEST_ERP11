from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.nfc import normalize_uid


class NfcCardCreate(BaseModel):
    uid: str = Field(max_length=40)
    label: str = Field(default="", max_length=50)

    @field_validator("uid")
    @classmethod
    def _uid_format(cls, v: str) -> str:
        return normalize_uid(v)

    @field_validator("label")
    @classmethod
    def _strip_label(cls, v: str) -> str:
        return v.strip()


class NfcCardOut(BaseModel):
    """카드 번호 원문은 돌려주지 않는다 (끝 4자리만)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    uid_last4: str
    label: str
    is_active: bool
    registered_at: datetime
    last_used_at: datetime | None
    deactivated_at: datetime | None


class DeviceRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    public_key: str = Field(pattern=r"^[0-9a-fA-F]{64}$")  # Ed25519 공개키 32바이트

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("기기 이름이 비어 있습니다.")
        return v


class DeviceRegisterOut(BaseModel):
    status: str


class DeviceRename(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    public_key_short: str  # 공개키 앞 8자리 (식별용)
    status: str
    approved_by: int | None
    approved_by_name: str | None
    approved_at: datetime | None
    last_seen_at: datetime | None
    last_ip: str | None
    created_at: datetime


class NfcChallengeRequest(BaseModel):
    public_key: str = Field(pattern=r"^[0-9a-fA-F]{64}$")


class NfcChallengeOut(BaseModel):
    nonce: str
    expires_in: int  # 초


class NfcLoginRequest(BaseModel):
    public_key: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    nonce: str = Field(pattern=r"^[0-9a-f]{32}$")
    uid: str = Field(max_length=40)
    signature: str = Field(pattern=r"^[0-9a-fA-F]{128}$")  # Ed25519 서명 64바이트

    @field_validator("uid")
    @classmethod
    def _uid_format(cls, v: str) -> str:
        return normalize_uid(v)
