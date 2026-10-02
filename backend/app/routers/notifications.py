import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.notification import Notification
from app.models.proposal import ProposalApprovalStep, ProposalStepStatus
from app.models.user import User
from app.schemas.notification import NotificationOut, UnreadCountOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
logger = get_logger("Notifications")

RETENTION_DAYS = 365  # 업무 알림 보관 기간 (1년). 이후 조회 시점에 지난 알림을 정리한다.


def _purge_expired(db: Session) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    deleted = db.query(Notification).filter(Notification.created_at < cutoff).delete(synchronize_session=False)
    if deleted:
        db.commit()
        logger.debug(f"[Notifications] 보관기간({RETENTION_DAYS}일) 경과 알림 정리: {deleted}건 삭제")


_OPEN_ID = re.compile(r"[?&]open=(\d+)")


def _link_target(link: str | None) -> tuple[str, int] | None:
    """알림 링크(?open=ID)에서 결재 대상 종류와 id를 읽는다. 결재와 무관한 링크면 None."""
    if not link:
        return None
    m = _OPEN_ID.search(link)
    if not m:
        return None
    target_id = int(m.group(1))
    path = link.split("?")[0]
    if path == "/leaves":
        return ("leave", target_id)
    if path == "/documents":
        return ("document", target_id)
    if path in ("/tax-invoices", "/project-documents"):
        return ("proposal" if "tab=proposal" in link else "project_document", target_id)
    return None


def _with_approval_done(db: Session, user_id: int, items: list[Notification]) -> list[NotificationOut]:
    """결재 요청 알림에 '내 결재 완료' 여부를 덧붙인다 (목록 한 번에 단계 테이블을 조회해 N+1 방지)."""
    targets: dict[int, tuple[str, int]] = {}
    for n in items:
        if n.title.endswith("결재 요청"):
            t = _link_target(n.link)
            if t:
                targets[n.id] = t

    done: set[tuple[str, int]] = set()
    generic = {k: [i for kk, i in targets.values() if kk == k] for k in ("leave", "document", "project_document")}
    for kind, ids in generic.items():
        if not ids:
            continue
        rows = (
            db.query(ApprovalStep.target_id)
            .filter(
                ApprovalStep.target_type == ApprovalTargetType(kind),
                ApprovalStep.target_id.in_(ids),
                ApprovalStep.approver_id == user_id,
                ApprovalStep.status == ApprovalStepStatus.approved,
            )
            .all()
        )
        done.update((kind, r[0]) for r in rows)
    proposal_ids = [i for k, i in targets.values() if k == "proposal"]
    if proposal_ids:
        rows = (
            db.query(ProposalApprovalStep.proposal_id)
            .filter(
                ProposalApprovalStep.proposal_id.in_(proposal_ids),
                ProposalApprovalStep.approver_id == user_id,
                ProposalApprovalStep.status == ProposalStepStatus.approved,
            )
            .all()
        )
        done.update(("proposal", r[0]) for r in rows)

    result = []
    for n in items:
        out = NotificationOut.model_validate(n)
        if n.id in targets:
            out.my_approval_done = targets[n.id] in done
        result.append(out)
    return result


@router.get("", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _purge_expired(db)
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return _with_approval_done(db, current_user.id, items)


@router.get("/unread-count", response_model=UnreadCountOut)
def get_unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .count()
    )
    return UnreadCountOut(count=count)


@router.put("/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="알림을 찾을 수 없습니다.")
    n.is_read = True
    db.commit()
    db.refresh(n)
    logger.debug(f"[Notifications] 읽음 처리: id={notification_id}, user_id={current_user.id}")
    return n


@router.put("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read.is_(False)).update(
        {Notification.is_read: True}
    )
    db.commit()
    logger.debug(f"[Notifications] 전체 읽음 처리: user_id={current_user.id}")
    return None
