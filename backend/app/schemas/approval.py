from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.approval_step import ApprovalStepStatus
from app.models.user import JobTitle


class ApprovalStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_order: int
    title: JobTitle
    approver_id: int
    approver_name: str
    status: ApprovalStepStatus
    decided_at: datetime | None


def to_approval_step_out(step) -> ApprovalStepOut:
    return ApprovalStepOut(
        step_order=step.step_order,
        title=step.title,
        approver_id=step.approver_id,
        approver_name=step.approver.name,
        status=step.status,
        decided_at=step.decided_at,
    )
