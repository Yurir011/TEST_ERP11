"""drop old proposal steps: 통합 전 품의서 결재 단계 테이블(proposal_approval_steps)과 그 상태 enum 을 지운다.

- 0005 에서 모든 행을 공용 테이블(approval_steps, 대상 종류 'proposal')로 옮겼고, 코드는 그 뒤로 옛 테이블을 쓰지 않는다.
- 지우기 전에 옛 테이블의 모든 행이 공용 테이블에 같은 값으로 있는지 다시 확인하고, 하나라도 없으면 실패시킨다(아무것도 지우지 않음).
- 되돌리기(downgrade): 테이블·enum 을 다시 만들고 공용 테이블의 품의서 결재 단계를 그대로 복사해 넣는다.
설계: docs/refactoring/09-proposal-approval-merge-plan.md (5단계)

Revision ID: 0006_drop_old_proposal_steps
Revises: 0005_move_proposal_steps
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "0006_drop_old_proposal_steps"
down_revision: Union[str, Sequence[str], None] = "0005_move_proposal_steps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 옛 테이블에만 있고 공용 테이블에 없는 행 수 (0 이어야 지울 수 있다)
MISSING_SQL = """
SELECT count(*) FROM (
    SELECT proposal_id, step_order, title::text, approver_id, status::text, decided_at FROM proposal_approval_steps
    EXCEPT
    SELECT target_id, step_order, title::text, approver_id, status::text, decided_at FROM approval_steps WHERE target_type = 'proposal'
) missing
"""

DROP_SQL = [
    "DROP INDEX IF EXISTS ix_proposal_approval_steps_proposal_id",
    "DROP TABLE proposal_approval_steps",
    "DROP TYPE IF EXISTS proposalstepstatus",
]

# 0001 baseline 과 같은 구조
CREATE_SQL = [
    "CREATE TYPE proposalstepstatus AS ENUM ('pending', 'approved', 'rejected')",
    """CREATE TABLE proposal_approval_steps (
        id SERIAL PRIMARY KEY,
        proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        title jobtitle NOT NULL,
        approver_id INTEGER NOT NULL REFERENCES users(id),
        status proposalstepstatus NOT NULL,
        decided_at TIMESTAMP WITH TIME ZONE
    )""",
    "CREATE INDEX ix_proposal_approval_steps_proposal_id ON proposal_approval_steps (proposal_id)",
]

RESTORE_SQL = """
INSERT INTO proposal_approval_steps (proposal_id, step_order, title, approver_id, status, decided_at)
SELECT target_id, step_order, title, approver_id, status::text::proposalstepstatus, decided_at
FROM approval_steps WHERE target_type = 'proposal'
ORDER BY target_id, step_order
"""


def ensure_old_rows_kept(bind) -> None:
    """옛 테이블의 모든 행이 공용 테이블에 있는지 확인한다. 없으면 RuntimeError (테스트에서도 사용)."""
    missing = bind.execute(text(MISSING_SQL)).scalar()
    if missing:
        raise RuntimeError(f"옛 품의서 결재 단계 {missing}행이 공용 테이블에 없습니다. 옛 테이블을 지우지 않습니다.")


def drop_old_table(bind) -> None:
    ensure_old_rows_kept(bind)
    for sql in DROP_SQL:
        bind.execute(text(sql))


def restore_old_table(bind) -> int:
    """옛 테이블을 다시 만들고 공용 테이블의 품의서 결재 단계를 복사한다. 복사한 행 수를 돌려준다 (테스트에서도 사용)."""
    for sql in CREATE_SQL:
        bind.execute(text(sql))
    return bind.execute(text(RESTORE_SQL)).rowcount


def upgrade() -> None:
    drop_old_table(op.get_bind())


def downgrade() -> None:
    restore_old_table(op.get_bind())
