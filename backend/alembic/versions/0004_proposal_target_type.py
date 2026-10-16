"""proposal target type: 공용 결재 단계(approval_steps)의 대상 종류 enum 에 'proposal' 을 추가한다.

PostgreSQL 은 enum 에 추가한 값을 같은 트랜잭션 안에서 바로 쓸 수 없어서, 값 추가만 별도 리비전으로 두고
자동 커밋 구간에서 실행한다. 설계: docs/refactoring/09-proposal-approval-merge-plan.md

Revision ID: 0004_proposal_target_type
Revises: 0003_audit_logs
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_proposal_target_type"
down_revision: Union[str, Sequence[str], None] = "0003_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE approvaltargettype ADD VALUE IF NOT EXISTS 'proposal'")


def downgrade() -> None:
    # PostgreSQL 은 enum 값을 지울 수 없다. 값이 남아 있어도 쓰는 행이 없으면 동작에 영향이 없다(0005 downgrade 가 행을 지운다).
    pass
