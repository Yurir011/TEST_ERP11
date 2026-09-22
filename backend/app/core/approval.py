from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import JobTitle, User

APPROVER_TITLES = (JobTitle.team_lead, JobTitle.ceo)


def resolve_approver(db: Session, approver_id: int | None) -> User:
    """결재 신청 시 선택한 approver_id가 실제 활성 상태의 팀장/대표인지 검증한다."""
    if approver_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="결재권자를 선택해주세요.")

    approver = (
        db.query(User)
        .filter(User.id == approver_id, User.title.in_(APPROVER_TITLES), User.is_active.is_(True))
        .first()
    )
    if approver is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="선택한 결재권자 정보가 올바르지 않습니다.")
    return approver


def is_self_approval(approver: User, current_user: User) -> bool:
    """신청자 본인이 팀장/대표이고 스스로를 결재권자로 선택한 경우 즉시 승인 처리한다."""
    return approver.id == current_user.id
