"""감사 로그 자동 기록.

DB 에 쓸 때(flush) 대상 모델의 생성·수정·삭제를 감지해 같은 트랜잭션 안에서 audit_logs 에 기록한다.
업무 데이터와 기록이 함께 저장되거나 함께 취소되므로, 실패한 요청은 기록도 남지 않는다.

"누가"는 요청마다 미들웨어가 만든 AuditActor 에 담긴다(접속 주소·요청 경로). 로그인한 사용자는 인증 의존성
(get_current_user)이 같은 객체에 채운다. 요청 밖(스크립트)에서는 "시스템(스크립트명)"으로 기록한다.

주의: FastAPI 는 동기 의존성과 엔드포인트를 서로 다른 스레드에서, 컨텍스트를 복사해 실행한다. 그래서 contextvar 에는
"값"이 아니라 미들웨어가 넣은 **같은 객체**를 두고 그 객체의 필드를 채운다(복사본끼리 같은 객체를 가리킨다).
설계: docs/refactoring/08-audit-log-plan.md
"""
import enum
import os
import sys
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import event, inspect, insert
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.payment import Payment
from app.models.project_document import ProjectDocument
from app.models.proposal import Proposal
from app.models.transaction import Transaction
from app.models.user import User

logger = get_logger("Audit")


@dataclass
class AuditActor:
    user_id: int | None = None
    user_name: str | None = None
    ip: str | None = None
    request: str | None = None


_actor: ContextVar[AuditActor | None] = ContextVar("audit_actor", default=None)


def start_request(ip: str | None, request: str) -> object:
    """미들웨어에서 요청 시작 때 호출. 반환값을 end_request 에 넘긴다."""
    return _actor.set(AuditActor(ip=ip, request=request))


def end_request(token: object) -> None:
    _actor.reset(token)  # type: ignore[arg-type]


def set_current_user(user: User) -> None:
    """인증 의존성에서 호출: 이번 요청의 사용자를 기록 대상에 채운다."""
    actor = _actor.get()
    if actor is not None:
        actor.user_id = user.id
        actor.user_name = user.name


def _current_actor() -> AuditActor:
    actor = _actor.get()
    if actor is not None:
        return actor
    script = os.path.basename(sys.argv[0]) if sys.argv and sys.argv[0] else "unknown"
    return AuditActor(user_name=f"시스템({script})", request="script")


# ── 기록 대상 설정 ────────────────────────────────────────────────
@dataclass(frozen=True)
class AuditTarget:
    entity_type: str
    label: str  # 한 줄 설명에 쓰는 이름
    fields: tuple[str, ...]  # 수정 시 기록할 필드 (이 필드가 하나도 안 바뀌면 기록하지 않는다)
    masked: tuple[str, ...] = ()  # 값 대신 "변경됨"만 남길 필드
    name_attr: str | None = None  # 설명에 붙일 이름 필드


TARGETS: dict[type, AuditTarget] = {
    Transaction: AuditTarget(
        "transaction", "매입매출",
        ("type", "transaction_date", "client_id", "counterparty", "item_name", "supply_amount", "vat_amount", "total_amount",
         "tax_invoice_no", "memo", "settled", "settled_date", "settled_payment_id", "paid_amount"),
        name_attr="item_name",
    ),
    Payment: AuditTarget(
        "payment", "입출금",
        ("type", "payment_date", "category", "description", "amount", "method", "client_id", "card_type", "bank_type",
         "card_pending", "proof_type", "partial_transaction_id", "memo"),
        name_attr="description",
    ),
    Client: AuditTarget(
        "client", "거래처",
        ("name", "biz_reg_no", "ceo_name", "phone", "email", "bank_name", "bank_account", "address", "receivable_amount", "payable_amount"),
        name_attr="name",
    ),
    User: AuditTarget(
        "user", "직원 계정",
        ("employee_no", "email", "name", "role", "grade", "title", "is_active", "menu_permissions", "hashed_password"),
        masked=("hashed_password",),
        name_attr="name",
    ),
    ProjectDocument: AuditTarget(
        "project_document", "문서",
        ("status", "delete_requested", "popbill_issued_at", "reject_reason"),
        name_attr="client_name",
    ),
    Proposal: AuditTarget("proposal", "품의서", ("status", "delete_requested", "reject_reason"), name_attr="title"),
}

FIELD_LABELS = {
    "receivable_amount": "미수금",
    "payable_amount": "미지급금",
    "total_amount": "합계",
    "paid_amount": "받은(준) 금액",
    "amount": "금액",
    "settled": "결제완료",
    "status": "상태",
    "menu_permissions": "메뉴 권한",
    "role": "역할",
    "is_active": "사용 여부",
    "hashed_password": "비밀번호",
    "delete_requested": "삭제 요청",
}


def _plain(value: Any) -> Any:
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


def _fmt(value: Any) -> str:
    if isinstance(value, bool):
        return "예" if value else "아니오"
    if isinstance(value, int):
        return f"{value:,}"
    return "없음" if value is None else str(value)


def _changes_for_update(obj: Any, target: AuditTarget) -> dict[str, list]:
    state = inspect(obj)
    changes: dict[str, list] = {}
    for field in target.fields:
        hist = state.attrs[field].history
        if not hist.has_changes():
            continue
        before = hist.deleted[0] if hist.deleted else None
        after = hist.added[0] if hist.added else None
        if _plain(before) == _plain(after):
            continue
        changes[field] = ["(변경됨)", "(변경됨)"] if field in target.masked else [_plain(before), _plain(after)]
    return changes


def _snapshot(obj: Any, target: AuditTarget, action: str) -> dict[str, list]:
    """생성/삭제 때: 필드 값 전체 (생성은 [None, 값], 삭제는 [값, None])."""
    out = {}
    for field in target.fields:
        value = "(설정됨)" if field in target.masked else _plain(getattr(obj, field, None))
        out[field] = [None, value] if action == "create" else [value, None]
    return out


def _summary(action: str, obj: Any, target: AuditTarget, changes: dict[str, list] | None) -> str:
    name = getattr(obj, target.name_attr, None) if target.name_attr else None
    head = f"{target.label} {name}" if name else f"{target.label} #{getattr(obj, 'id', '?')}"
    if action == "create":
        return f"{head} 등록"
    if action == "delete":
        return f"{head} 삭제"
    parts = []
    for field, (before, after) in list((changes or {}).items())[:4]:
        parts.append(f"{FIELD_LABELS.get(field, field)} {_fmt(before)} → {_fmt(after)}")
    more = f" 외 {len(changes) - 4}건" if changes and len(changes) > 4 else ""
    return f"{head} 수정: " + ", ".join(parts) + more


def _row(action: str, obj: Any, target: AuditTarget, changes: Any) -> dict:
    actor = _current_actor()
    return {
        "user_id": actor.user_id,
        "user_name": actor.user_name,
        "ip": actor.ip,
        "request": actor.request,
        "action": action,
        "entity_type": target.entity_type,
        "entity_id": getattr(obj, "id", None),
        "changes": changes,
        "summary": _summary(action, obj, target, changes if action == "update" else None),
    }


@event.listens_for(Session, "after_flush")
def _record_changes(session: Session, flush_context) -> None:  # noqa: ARG001
    """flush 직후(아이디가 정해지고 변경 이력이 아직 남아 있는 시점)에 같은 연결로 기록을 넣는다."""
    rows = []
    for obj in session.new:
        target = TARGETS.get(type(obj))
        if target:
            rows.append(_row("create", obj, target, _snapshot(obj, target, "create")))
    for obj in session.dirty:
        target = TARGETS.get(type(obj))
        if target and session.is_modified(obj, include_collections=False):
            changes = _changes_for_update(obj, target)
            if changes:
                rows.append(_row("update", obj, target, changes))
    for obj in session.deleted:
        target = TARGETS.get(type(obj))
        if target:
            rows.append(_row("delete", obj, target, _snapshot(obj, target, "delete")))
    if rows:
        session.connection().execute(insert(AuditLog.__table__), rows)
        logger.debug(f"[Audit] 변경 이력 {len(rows)}건 기록: " + ", ".join(r["summary"] for r in rows)[:300])


def record_event(session: Session, action: str, entity_type: str, entity_id: int | None, summary: str, changes: dict | None = None) -> None:
    """DB 변경이 없는 일(로그인 등)을 직접 기록한다. 커밋은 호출한 쪽이 한다."""
    actor = _current_actor()
    session.add(
        AuditLog(
            user_id=actor.user_id,
            user_name=actor.user_name,
            ip=actor.ip,
            request=actor.request,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=changes,
            summary=summary,
        )
    )
