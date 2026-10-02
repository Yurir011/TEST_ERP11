from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    message: str
    link: str | None
    is_read: bool
    created_at: datetime
    my_approval_done: bool | None = None  # 결재 요청 알림에서 수신자 본인의 결재 완료 여부 (그 외 알림은 None)


class UnreadCountOut(BaseModel):
    count: int
