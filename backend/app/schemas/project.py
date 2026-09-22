from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    client_id: int
    memo: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class ProjectStatusUpdate(BaseModel):
    status: ProjectStatus


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
    start_date: date | None
    end_date: date | None
    progress_percent: int
    creator_name: str
    created_at: datetime
    updated_at: datetime
