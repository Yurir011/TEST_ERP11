from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.project_progress import PurchaseStepKey


class ProgressStageCreate(BaseModel):
    name: str


class ProgressStageProgressUpdate(BaseModel):
    progress_percent: int


class ProgressStageScheduleUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None


class ProgressStageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    order_index: int
    progress_percent: int
    completed_on: date | None
    start_date: date | None
    end_date: date | None


class PurchaseStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    step_key: PurchaseStepKey
    label: str
    order_index: int
    is_done: bool
    completed_on: date | None


class PurchaseStepRename(BaseModel):
    label: str
