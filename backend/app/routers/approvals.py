"""결재 공통 조회: 내가 처리한(승인·반려한) 결재 내역. 모바일 결재 화면의 [처리 내역]에서 쓴다.

연차·증명서·문서(견적서 등)·품의서는 결재 단계를 공용 테이블(approval_steps)에 두므로, 내가 결재권자였던 단계를 모아
대상 문서의 이름을 붙여 돌려준다. 기안자가 본인을 결재권자로 지정해 자동 승인된 단계(자기결재)는 내가 처리한 것이 아니므로 뺀다.
"""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.document import DocumentIssue
from app.models.leave import LeaveRequest
from app.models.project_document import ProjectDocument
from app.models.proposal import Proposal
from app.models.user import User
from app.routers.project_documents._common import DOC_TYPE_LABELS_KO
from app.services.certificate_pdf import DOC_TITLES

router = APIRouter(prefix="/api/approvals", tags=["approvals"])
logger = get_logger("Approvals")


class ApprovalHistoryItemOut(BaseModel):
    kind: Literal["leave", "document", "project", "proposal"]
    id: int
    kind_label: str
    title: str
    subtitle: str
    result: Literal["approved", "rejected"]
    decided_at: datetime
    doc_status: str  # 문서의 현재 상태 (그 뒤에 최종 승인·반려됐는지 알 수 있다)


_KIND_BY_TARGET = {
    ApprovalTargetType.leave: "leave",
    ApprovalTargetType.document: "document",
    ApprovalTargetType.project_document: "project",
    ApprovalTargetType.proposal: "proposal",
}


def _by_id(db: Session, model, ids: list[int]) -> dict[int, object]:
    if not ids:
        return {}
    return {row.id: row for row in db.query(model).filter(model.id.in_(ids)).all()}


@router.get("/history", response_model=list[ApprovalHistoryItemOut])
def my_approval_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.debug(f"[Approvals] 처리 내역 조회: user_id={current_user.id}, limit={limit}")
    # 자기결재 단계를 걸러 내면 개수가 줄 수 있어 넉넉히 가져온 뒤 자른다.
    steps = (
        db.query(ApprovalStep)
        .filter(
            ApprovalStep.approver_id == current_user.id,
            ApprovalStep.status != ApprovalStepStatus.pending,
            ApprovalStep.decided_at.isnot(None),
        )
        .order_by(ApprovalStep.decided_at.desc(), ApprovalStep.id.desc())
        .limit(limit * 3)
        .all()
    )

    def ids_of(target: ApprovalTargetType) -> list[int]:
        return [s.target_id for s in steps if s.target_type == target]

    leaves = _by_id(db, LeaveRequest, ids_of(ApprovalTargetType.leave))
    documents = _by_id(db, DocumentIssue, ids_of(ApprovalTargetType.document))
    project_docs = _by_id(db, ProjectDocument, ids_of(ApprovalTargetType.project_document))
    proposals = _by_id(db, Proposal, ids_of(ApprovalTargetType.proposal))

    items: list[ApprovalHistoryItemOut] = []
    for step in steps:
        kind = _KIND_BY_TARGET[step.target_type]
        base = dict(kind=kind, id=step.target_id, result=step.status.value, decided_at=step.decided_at)
        if step.target_type == ApprovalTargetType.leave:
            leave = leaves.get(step.target_id)
            if leave is None or leave.user_id == current_user.id:
                continue
            items.append(ApprovalHistoryItemOut(
                **base, kind_label="연차", title=f"{leave.start_date} ~ {leave.end_date} ({leave.days}일)",
                subtitle=f"{leave.user.name} · {leave.reason}", doc_status=leave.status.value,
            ))
        elif step.target_type == ApprovalTargetType.document:
            doc = documents.get(step.target_id)
            if doc is None or doc.user_id == current_user.id:
                continue
            items.append(ApprovalHistoryItemOut(
                **base, kind_label="증빙서류", title=DOC_TITLES[doc.doc_type],
                subtitle=f"{doc.user.name}{f' · {doc.purpose}' if doc.purpose else ''}", doc_status=doc.status.value,
            ))
        elif step.target_type == ApprovalTargetType.project_document:
            pdoc = project_docs.get(step.target_id)
            if pdoc is None or pdoc.created_by == current_user.id:
                continue
            items.append(ApprovalHistoryItemOut(
                **base, kind_label=DOC_TYPE_LABELS_KO[pdoc.doc_type], title=pdoc.project_display_name,
                subtitle=f"{pdoc.client_name}{f' · {pdoc.doc_no}' if pdoc.doc_no else ''}", doc_status=pdoc.status.value,
            ))
        else:
            proposal = proposals.get(step.target_id)
            if proposal is None or proposal.created_by == current_user.id:
                continue
            items.append(ApprovalHistoryItemOut(
                **base, kind_label=f"품의서({proposal.kind})" if proposal.kind else "품의서", title=proposal.title,
                subtitle=f"{proposal.creator.name} · {proposal.doc_no}", doc_status=proposal.status.value,
            ))
        if len(items) >= limit:
            break
    logger.debug(f"[Approvals] 처리 내역 {len(items)}건 반환: user_id={current_user.id}")
    return items
