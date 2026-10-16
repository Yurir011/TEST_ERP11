"""거래처 잔액(미수금/미지급금) 변경 이력.

감사 로그(audit_logs)에서 그 거래처의 잔액 필드가 바뀐 기록을 모으고, 같은 요청에서 함께 기록된 입출금·매입매출 변경을
찾아 "무엇 때문에 바뀌었는지"를 붙인다. 같은 요청의 기록은 같은 트랜잭션에서 저장되므로 기록 시각(created_at, DB 의
트랜잭션 시작 시각)과 요청 경로가 같다는 점으로 묶는다.
"""
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

BALANCE_FIELDS = {"receivable": "receivable_amount", "payable": "payable_amount"}
_SOURCE_TYPES = ("payment", "transaction")


class BalanceHistoryEntry(BaseModel):
    created_at: datetime
    user_name: str | None
    before: int
    after: int
    delta: int
    description: str  # 무엇 때문에 바뀌었는지 (예: "입출금 수금 등록")
    source_type: str | None  # payment / transaction (원인 내역으로 이동할 때 사용)
    source_id: int | None
    source_deleted: bool  # 원인 내역이 삭제된 경우(이동 불가)
    request: str | None


def _fallback_description(log: AuditLog) -> str:
    request = log.request or ""
    if request == "script":
        return f"{log.user_name or '시스템'} 처리"
    if request.startswith("PUT /api/clients") or request.startswith("POST /api/clients"):
        return "거래처 정보에서 직접 수정"
    return request or "알 수 없음"


def build_balance_history(db: Session, client_id: int, kind: str, limit: int = 200) -> list[BalanceHistoryEntry]:
    field = BALANCE_FIELDS[kind]
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "client", AuditLog.entity_id == client_id, AuditLog.action.in_(("create", "update")))
        .order_by(AuditLog.id.desc())
        .limit(limit * 3)  # 잔액과 무관한 수정 기록도 섞여 있으므로 넉넉히 읽고 거른다
        .all()
    )
    entries: list[BalanceHistoryEntry] = []
    for log in logs:
        pair = (log.changes or {}).get(field)
        if not pair:
            continue
        before, after = int(pair[0] or 0), int(pair[1] or 0)
        if before == after:
            continue
        siblings = (
            db.query(AuditLog)
            .filter(
                AuditLog.created_at == log.created_at,
                AuditLog.request == log.request,
                AuditLog.entity_type.in_(_SOURCE_TYPES),
                AuditLog.id != log.id,
            )
            .order_by(AuditLog.id)
            .all()
        )
        # 입출금이 있으면 입출금을 원인으로 본다 (입출금이 매입매출 결제 상태를 함께 바꾸는 경우가 많다)
        source = next((s for s in siblings if s.entity_type == "payment"), None) or (siblings[0] if siblings else None)
        if source is not None:
            deleted = source.action == "delete" or (
                db.query(AuditLog)
                .filter(AuditLog.entity_type == source.entity_type, AuditLog.entity_id == source.entity_id, AuditLog.action == "delete")
                .first()
                is not None
            )
            description = source.summary or f"{source.entity_type} #{source.entity_id}"
        else:
            deleted = False
            description = _fallback_description(log) if log.action == "update" else "거래처 등록"
        entries.append(
            BalanceHistoryEntry(
                created_at=log.created_at,
                user_name=log.user_name,
                before=before,
                after=after,
                delta=after - before,
                description=description,
                source_type=source.entity_type if source else None,
                source_id=source.entity_id if source else None,
                source_deleted=deleted,
                request=log.request,
            )
        )
        if len(entries) >= limit:
            break
    return entries
