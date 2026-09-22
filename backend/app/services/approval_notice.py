from sqlalchemy.orm import Session

from app.models.notice import Notice


def create_decision_notice(
    db: Session,
    *,
    category: str,
    target_name: str,
    doc_label: str,
    approved: bool,
    author_id: int,
    detail: str | None = None,
) -> Notice:
    """결재 승인/반려 결과를 전 직원 공지사항에 짧게 게시한다."""
    decision_label = "승인" if approved else "반려"
    notice = Notice(
        title=f"[{category}] {target_name}님 {doc_label} {decision_label} 안내",
        content=(
            f"{target_name}님의 {doc_label}이(가) {decision_label}되었습니다."
            + (f"\n{detail}" if detail else "")
        ),
        author_id=author_id,
    )
    db.add(notice)
    return notice
