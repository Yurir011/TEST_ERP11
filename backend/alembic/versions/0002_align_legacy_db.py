"""align legacy db: 예전 1회성 스크립트로 만든 DB 를 기준점(0001)과 같은 구조로 맞춘다.

예전 스크립트가 컬럼을 추가하며 붙인 DB 기본값(DEFAULT) 19개를 지우고, 빠진 NOT NULL 과 인덱스를 채운다.
모든 문장은 이미 같은 상태면 아무 일도 하지 않으므로, 기준점에서 새로 만든 DB 에서는 변화가 없다.
데이터는 바꾸지 않는다 (document_issues.status 에 NULL 행이 없음을 확인한 뒤 NOT NULL 을 지정한다).

Revision ID: 0002_align_legacy_db
Revises: 0001_baseline
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_align_legacy_db"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (테이블, 컬럼) — 모델에는 DB 기본값이 없고 앱이 값을 항상 직접 넣는 컬럼들
LEGACY_DEFAULTS = [
    ("clients", "receivable_amount"),
    ("clients", "payable_amount"),
    ("document_issues", "status"),
    ("document_issues", "current_step"),
    ("document_issues", "is_final_decision"),
    ("leave_requests", "current_step"),
    ("leave_requests", "is_final_decision"),
    ("project_documents", "currency"),
    ("project_documents", "purpose_type"),
    ("project_documents", "status"),
    ("project_documents", "current_step"),
    ("project_documents", "is_final_decision"),
    ("project_documents", "payment_recorded"),
    ("project_progress_stages", "progress_percent"),
    ("projects", "progress_percent"),
    ("proposals", "is_final_decision"),
    ("schedule_events", "is_lunar"),
    ("schedule_events", "sort_order"),
    ("users", "grade"),
]


def upgrade() -> None:
    for table, column in LEGACY_DEFAULTS:
        op.execute(f'ALTER TABLE "{table}" ALTER COLUMN "{column}" DROP DEFAULT')

    # NULL 행이 있으면 NOT NULL 지정이 실패하므로 먼저 확인한다 (있으면 데이터를 바꾸지 않고 멈춘다).
    bind = op.get_bind()
    nulls = bind.exec_driver_sql("SELECT count(*) FROM document_issues WHERE status IS NULL").scalar()
    if nulls:
        raise RuntimeError(f"document_issues.status 가 NULL 인 행이 {nulls}건 있어 NOT NULL 을 지정할 수 없습니다. 값을 먼저 채워주세요.")
    op.execute('ALTER TABLE "document_issues" ALTER COLUMN "status" SET NOT NULL')

    op.execute('CREATE INDEX IF NOT EXISTS "ix_schedule_events_recurrence_group_id" ON "schedule_events" ("recurrence_group_id")')


def downgrade() -> None:
    # 예전 DB 기본값과 NULL 허용은 되살리지 않는다(앱 동작과 무관하고, 원래 값이 DB 마다 달랐을 수 있다).
    # 인덱스만 0001 이전 상태로 되돌릴 이유가 없으므로 그대로 둔다.
    pass
