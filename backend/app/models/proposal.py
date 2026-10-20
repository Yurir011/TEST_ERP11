import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, and_
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship
from sqlalchemy.sql import false, func

from app.database import Base
from app.models.approval_step import ApprovalStep, ApprovalTargetType

if TYPE_CHECKING:
    from app.models.user import User

# 부서 필드가 아직 없어 우선 고정값을 사용한다 (전 직원 연구개발팀 소속으로 간주).
DEPARTMENT_CODE = "RND"
DEPARTMENT_NAME = "연구개발팀"

MAX_APPROVAL_STEPS = 3

# 구매 품의서: 승인 후 발주서 작성 → 발송 확인 → 입고 확인까지 한 장의 카드로 이어서 관리하는 품의서 종류 이름.
PURCHASE_KIND = "구매"


class ProposalStatus(str, enum.Enum):
    pending = "pending"  # 결재 대기 중 (현재 단계 결재권자의 승인 대기)
    approved = "approved"  # 전 단계 결재 완료
    rejected = "rejected"  # 반려됨


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
    # 승인된 품의서의 삭제 결재가 진행 중인지 여부. 삭제 결재 동안 문서는 결재 대기(pending) 상태가 되고,
    # 최종 승인되면 삭제되며, 반려되면 delete_prev_steps에 저장해 둔 이전 승인 상태(결재선 포함)로 되돌아간다.
    delete_requested: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    delete_prev_steps: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 구매 품의서의 발주·입고 진행(사용자가 직접 확인 처리). 발송 확인 후에만 입고 확인을 할 수 있다.
    order_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order_sent_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    # 결재 단계는 다른 문서와 같은 공용 테이블(approval_steps, 대상 종류 'proposal')에 저장한다 (2026-10-16 통합, 리비전 0005).
    # 대상 종류는 관계가 자동으로 채우지 못하므로 단계를 만들 때 target_type=ApprovalTargetType.proposal 을 직접 넣는다.
    steps: Mapped[list["ApprovalStep"]] = relationship(
        "ApprovalStep",
        primaryjoin=lambda: and_(
            foreign(ApprovalStep.target_id) == Proposal.id, ApprovalStep.target_type == ApprovalTargetType.proposal
        ),
        cascade="all, delete-orphan",
        order_by=lambda: ApprovalStep.step_order,
        overlaps="steps",
    )
    attachments: Mapped[list["ProposalAttachment"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalAttachment.id"
    )


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
