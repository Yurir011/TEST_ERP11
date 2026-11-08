from typing import Literal

from pydantic import BaseModel, Field, field_validator


class DeviceTokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=512)  # FCM 토큰
    platform: Literal["ios", "android"] = "ios"
    device_name: str | None = Field(default=None, max_length=100)
    app_version: str | None = Field(default=None, max_length=20)

    @field_validator("token")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 20:
            raise ValueError("토큰이 올바르지 않습니다.")
        return v


class DeviceTokenDelete(BaseModel):
    token: str = Field(min_length=1, max_length=512)
