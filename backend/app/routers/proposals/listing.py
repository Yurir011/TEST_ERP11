"""품의서 목록 (필터: 상태·내 결재함 등)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.approval_step import ApprovalStep, ApprovalTargetType
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User
from app.routers.proposals._common import PREFIX, _QUERY_OPTIONS, _to_out
from app.schemas.proposal import ProposalOut

router = APIRouter(prefix=PREFIX, tags=["proposals"])


@router.get("", response_model=list[ProposalOut])
def list_proposals(
    status_filter: ProposalStatus | None = Query(default=None, alias="status"),
    approver_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Proposal).options(*_QUERY_OPTIONS)
    if approver_mine:
        query = query.join(
            ApprovalStep,
            (ApprovalStep.target_id == Proposal.id) & (ApprovalStep.target_type == ApprovalTargetType.proposal),
        ).filter(
            ApprovalStep.approver_id == current_user.id,
            ApprovalStep.step_order == Proposal.current_step,
            Proposal.status == ProposalStatus.pending,
        )
    if status_filter is not None:
        query = query.filter(Proposal.status == status_filter)
    proposals = query.order_by(Proposal.issue_date.desc(), Proposal.id.desc()).all()
    return [_to_out(p) for p in proposals]
