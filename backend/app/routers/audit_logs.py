"""감사 로그 조회 (대표 전용). 기록은 app/core/audit.py 가 자동으로 남기며, 이 API 는 읽기만 한다(수정·삭제 없음)."""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])
logger = get_logger("AuditLogs")


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    entity_type: str | None = Query(default=None, description="예: client, payment, transaction, user. 쉼표로 여러 개(project_document,proposal)"),
    entity_id: int | None = Query(default=None),
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None, description="create / update / delete / login(로그인 관련 전체) / login_success / login_failed / login_blocked"),
    q: str | None = Query(default=None, description="한 줄 설명·사람 이름 검색"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """최신순. 기간은 날짜(포함) 기준이며 서버 시간대로 비교한다."""
    query = db.query(AuditLog)
    if entity_type:
        types = [t.strip() for t in entity_type.split(",") if t.strip()]
        query = query.filter(AuditLog.entity_type.in_(types))
    if entity_id is not None:
        query = query.filter(AuditLog.entity_id == entity_id)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action == "login":
        query = query.filter(AuditLog.action.like("login_%"))
    elif action:
        query = query.filter(AuditLog.action == action)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(AuditLog.summary.ilike(like), AuditLog.user_name.ilike(like)))
    if date_from:
        query = query.filter(AuditLog.created_at >= datetime.combine(date_from, time.min).astimezone())
    if date_to:
        query = query.filter(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min).astimezone())
    rows = query.order_by(AuditLog.id.desc()).offset(offset).limit(limit).all()
    logger.debug(f"[AuditLogs] 조회: entity={entity_type}:{entity_id}, user={user_id}, action={action}, count={len(rows)}, by={current_user.id}")
    return rows
