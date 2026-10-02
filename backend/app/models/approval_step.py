import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.user import JobTitle

if TYPE_CHECKING:
    from app.models.user import User


class ApprovalTargetType(str, enum.Enum):
    """다단계 결재선을 쓰는 대상 문서 종류. 품의서는 기존 proposal_approval_steps 테이블을 그대로 쓰므로 포함하지 않는다."""

    leave = "leave"
    document = "document"
    project_document = "project_document"


class ApprovalStepStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ApprovalStep(Base):
    """연차/증빙서류/문서관리(견적서·거래명세서·세금계산서) 공통 다단계 결재선의 한 단계.
    대상 레코드(target_type/target_id)에 대한 실제 FK 제약은 걸지 않는다 - 대상 테이블이 여러 개라 다형 참조이기 때문.
    step_order는 1부터 시작하며, 결재선은 항상 부서장→팀장→대표 순서의 앞부분(prefix)으로 구성된다."""

    __tablename__ = "approval_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[ApprovalTargetType] = mapped_column(Enum(ApprovalTargetType, name="approvaltargettype"), index=True)
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    step_order: Mapped[int] = mapped_column(Integer)
    title: Mapped[JobTitle] = mapped_column(Enum(JobTitle, name="jobtitle"))
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ApprovalStepStatus] = mapped_column(
        Enum(ApprovalStepStatus, name="approvalstepstatus"), default=ApprovalStepStatus.pending
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    approver: Mapped["User"] = relationship()
