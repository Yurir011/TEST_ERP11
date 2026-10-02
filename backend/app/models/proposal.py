import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.user import JobTitle

if TYPE_CHECKING:
    from app.models.user import User

# 부서 필드가 아직 없어 우선 고정값을 사용한다 (전 직원 연구개발팀 소속으로 간주).
DEPARTMENT_CODE = "RND"
DEPARTMENT_NAME = "연구개발팀"

MAX_APPROVAL_STEPS = 3


class ProposalStatus(str, enum.Enum):
    pending = "pending"  # 결재 대기 중 (현재 단계 결재권자의 승인 대기)
    approved = "approved"  # 전 단계 결재 완료
    rejected = "rejected"  # 반려됨


class ProposalStepStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Proposal(Base):
    """품의서. 정해진 문구("1. 아래와 같이 OO을 진행하고자...")와 자유 서술 내용으로 구성되며,
    최대 3단계(부서장->팀장->대표)의 순차 결재를 거친다. 마지막 단계는 항상 대표다."""

    __tablename__ = "proposals"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    kind: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 품의서 종류 (예: 구매, 출장). 없으면 그냥 "품의서"
    title: Mapped[str] = mapped_column(String(200))  # 제목
    topic: Mapped[str] = mapped_column(String(200))  # "1. 아래와 같이 [topic]을 진행하고자..." 문장의 빈칸
    content: Mapped[str] = mapped_column(Text)  # 자유 서술 본문
    department_code: Mapped[str] = mapped_column(String(20), default=DEPARTMENT_CODE)
    department_name: Mapped[str] = mapped_column(String(100), default=DEPARTMENT_NAME)
    issue_date: Mapped[date] = mapped_column(Date)
    status: Mapped[ProposalStatus] = mapped_column(
        Enum(ProposalStatus, name="proposalstatus"), default=ProposalStatus.pending
    )
    current_step: Mapped[int] = mapped_column(Integer, default=1)  # 현재 결재 대기 중인 단계 (1부터 시작)
    is_final_decision: Mapped[bool] = mapped_column(Boolean, default=False)  # 전결 여부 (결재선 없이 기안자 본인 결재로 즉시 완료, steps는 비어있음)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    steps: Mapped[list["ProposalApprovalStep"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalApprovalStep.step_order"
    )
    attachments: Mapped[list["ProposalAttachment"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalAttachment.id"
    )


class ProposalApprovalStep(Base):
    """품의서 결재선의 한 단계. step_order는 1부터 시작하며, 마지막 단계는 항상 title=ceo."""

    __tablename__ = "proposal_approval_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id", ondelete="CASCADE"), index=True)
    step_order: Mapped[int] = mapped_column(Integer)  # 1, 2, 3
    title: Mapped[JobTitle] = mapped_column(Enum(JobTitle, name="jobtitle"))  # 이 단계의 직책 (부서장/팀장/대표)
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ProposalStepStatus] = mapped_column(
        Enum(ProposalStepStatus, name="proposalstepstatus"), default=ProposalStepStatus.pending
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    proposal: Mapped["Proposal"] = relationship(back_populates="steps")
    approver: Mapped["User"] = relationship(foreign_keys=[approver_id])


class ProposalAttachmentKind(str, enum.Enum):
    file = "file"  # 업로드한 파일
    link = "link"  # 외부 URL 링크


class ProposalAttachment(Base):
    """품의서에 첨부하는 파일 또는 링크."""

    __tablename__ = "proposal_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id", ondelete="CASCADE"), index=True)
    kind: Mapped[ProposalAttachmentKind] = mapped_column(Enum(ProposalAttachmentKind, name="proposalattachmentkind"))
    label: Mapped[str] = mapped_column(String(200))  # 파일 원본 이름 또는 링크 설명
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    proposal: Mapped["Proposal"] = relationship(back_populates="attachments")
