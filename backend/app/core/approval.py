from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.user import JobTitle, User

APPROVER_TITLES = (JobTitle.team_lead, JobTitle.ceo)

# 결재선은 항상 이 순서의 앞부분(prefix)으로 구성된다 (부서장에서 시작, 선택한 "종료 단계"까지).
ORDERED_APPROVAL_TITLES = (JobTitle.dept_head, JobTitle.team_lead, JobTitle.ceo)


def build_chain_titles(db: Session, end_title: JobTitle) -> list[JobTitle]:
    """선택한 종료 단계(부서장/팀장/대표)까지의 결재선 직책 목록을 반환한다.
    해당 직책으로 지정된 (활성) 직원이 없는 단계는 건너뛴다."""
    idx = ORDERED_APPROVAL_TITLES.index(end_title)
    candidates = ORDERED_APPROVAL_TITLES[: idx + 1]
    staffed = {
        title
        for (title,) in db.query(User.title).filter(User.title.in_(candidates), User.is_active.is_(True)).distinct()
    }
    return [t for t in candidates if t in staffed]


def validate_chain_approvers(
    db: Session, end_title: JobTitle | None, approver_ids: list[int]
) -> tuple[list[JobTitle], list[User]]:
    """종료 단계와 단계별 결재자 id 목록을 검증하고, (직책 목록, 결재자 목록)을 반환한다."""
    if end_title is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재선의 종료 단계를 선택해주세요.")

    chain = build_chain_titles(db, end_title)
    if not chain:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재선에 지정할 수 있는 결재자가 없습니다.")
    if len(approver_ids) != len(chain):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{end_title.value} 선에서 종료하려면 결재자 {len(chain)}명이 필요합니다."
        )

    approvers: list[User] = []
    for step_title, approver_id in zip(chain, approver_ids):
        approver = (
            db.query(User)
            .filter(User.id == approver_id, User.title == step_title, User.is_active.is_(True))
            .first()
        )
        if approver is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{step_title.value} 결재자 정보가 올바르지 않습니다.")
        approvers.append(approver)
    return chain, approvers


def build_chain_steps(
    db: Session, target_type: ApprovalTargetType, target_id: int, chain: list[JobTitle], approvers: list[User]
) -> list[ApprovalStep]:
    """검증된 직책/결재자 목록으로 ApprovalStep 레코드를 만들어 추가한다(커밋은 호출부에서).
    status는 커밋 전에도 바로 비교할 수 있도록(advance_chain_self_approvals 등) 컬럼 기본값에 맡기지 않고 명시적으로 넣는다."""
    steps = [
        ApprovalStep(
            target_type=target_type,
            target_id=target_id,
            step_order=idx + 1,
            title=title,
            approver_id=approver.id,
            status=ApprovalStepStatus.pending,
        )
        for idx, (title, approver) in enumerate(zip(chain, approvers))
    ]
    for step in steps:
        db.add(step)
    return steps


def advance_chain_self_approvals(steps: list[ApprovalStep], current_user: User) -> bool:
    """기안자 본인이 연속된 단계의 결재권자로도 지정된 경우, 그 단계들을 즉시 승인 처리한다.
    전부 자기결재로 끝까지 진행되면 True, 중간에 다른 결재자의 단계에서 멈추면 False를 반환한다."""
    for step in steps:
        if step.approver_id != current_user.id:
            return False
        step.status = ApprovalStepStatus.approved
        step.decided_at = datetime.now(timezone.utc)
    return True


def get_steps(db: Session, target_type: ApprovalTargetType, target_id: int) -> list[ApprovalStep]:
    return (
        db.query(ApprovalStep)
        .filter(ApprovalStep.target_type == target_type, ApprovalStep.target_id == target_id)
        .order_by(ApprovalStep.step_order)
        .all()
    )


def get_steps_map(db: Session, target_type: ApprovalTargetType, target_ids: list[int]) -> dict[int, list[ApprovalStep]]:
    """목록 조회용: 여러 대상의 결재 단계를 한 번에 조회해 target_id별로 묶어 반환한다 (N+1 방지)."""
    if not target_ids:
        return {}
    rows = (
        db.query(ApprovalStep)
        .filter(ApprovalStep.target_type == target_type, ApprovalStep.target_id.in_(target_ids))
        .order_by(ApprovalStep.target_id, ApprovalStep.step_order)
        .all()
    )
    result: dict[int, list[ApprovalStep]] = {}
    for row in rows:
        result.setdefault(row.target_id, []).append(row)
    return result
