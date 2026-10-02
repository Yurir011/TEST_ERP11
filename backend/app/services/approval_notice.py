from sqlalchemy.orm import Session

from app.models.notification import Notification


def create_decision_notification(
    db: Session,
    *,
    target_name: str,
    target_user_id: int,
    doc_label: str,
    approved: bool,
    detail: str | None = None,
    link: str | None = None,
) -> Notification:
    """결재 승인/반려 결과를 신청 당사자에게 개인 업무 알림으로 보낸다.
    공지사항(Notice)에는 올리지 않는다 - 공지사항은 전 직원 대상 순수 공지만 다룬다."""
    decision_label = "승인" if approved else "반려"
    message = f"{target_name}님의 {doc_label}이(가) {decision_label}되었습니다." + (f"\n{detail}" if detail else "")

    notification = Notification(
        user_id=target_user_id,
        title=f"{doc_label} {decision_label}",
        message=message,
        link=link,
    )
    db.add(notification)
    return notification


def create_request_notification(
    db: Session,
    *,
    target_user_id: int,
    requester_name: str,
    doc_label: str,
    link: str | None = None,
) -> Notification:
    """새로운 결재 요청이 들어왔을 때 배정된 결재권자에게 개인 업무 알림으로 보낸다."""
    notification = Notification(
        user_id=target_user_id,
        title=f"{doc_label} 결재 요청",
        message=f"{requester_name}님이 {doc_label} 결재를 요청했습니다.",
        link=link,
    )
    db.add(notification)
    return notification
