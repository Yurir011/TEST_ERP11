from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    # 등록된 거래처는 client_id 로, 목록에 없는 거래처는 이름(client_name)을 직접 적어 보낸다 (없으면 그 이름으로 거래처를 새로 등록한다).
    client_id: int | None = None
    client_name: str | None = None
    memo: str | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def _need_client(self):
        self.client_name = (self.client_name or "").strip()[:200] or None
        if self.client_id is None and self.client_name is None:
            raise ValueError("거래처를 선택하거나 이름을 입력해주세요.")
        return self


class ProjectStatusUpdate(BaseModel):
    status: ProjectStatus
    reason: str | None = None  # 폐기 사유 (상태가 discarded일 때만 저장)


class ProjectScheduleUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def _validate_range(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("종료일은 시작일보다 빠를 수 없습니다.")
        return self


class ProjectProgressUpdate(BaseModel):
    progress_percent: int

    @model_validator(mode="after")
    def _validate_progress(self):
        if self.progress_percent < 0 or self.progress_percent > 100 or self.progress_percent % 10 != 0:
            raise ValueError("진행율은 0~100 사이의 10 단위 값이어야 합니다.")
        return self


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    client_id: int
    client_name: str
    status: ProjectStatus
    memo: str | None
    discard_reason: str | None
    start_date: date | None
    end_date: date | None
    progress_percent: int
    creator_name: str
    created_at: datetime
    updated_at: datetime
