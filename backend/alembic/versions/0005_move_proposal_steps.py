"""move proposal steps: 품의서 결재 단계를 전용 테이블(proposal_approval_steps)에서 공용 테이블(approval_steps)로 복사한다.

- 순서·직책·결재자·상태·결정 시각을 그대로 옮긴다(대상 종류 'proposal', 대상 번호 = 품의서 번호).
- 이미 옮겨진 행은 건너뛰므로 여러 번 실행해도 안전하다.
- 복사 후 품의서별 행 수와 상태별 수가 두 테이블에서 같은지 확인하고, 다르면 실패시킨다(트랜잭션이 취소되어 아무것도 바뀌지 않음).
- 옛 테이블은 지우지 않는다(되돌릴 때를 위해 보존. 삭제는 나중에 별도 리비전).
설계: docs/refactoring/09-proposal-approval-merge-plan.md

Revision ID: 0005_move_proposal_steps
Revises: 0004_proposal_target_type
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "0005_move_proposal_steps"
down_revision: Union[str, Sequence[str], None] = "0004_proposal_target_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COPY_SQL = """
INSERT INTO approval_steps (target_type, target_id, step_order, title, approver_id, status, decided_at)
SELECT 'proposal'::approvaltargettype, s.proposal_id, s.step_order, s.title, s.approver_id,
       s.status::text::approvalstepstatus, s.decided_at
FROM proposal_approval_steps s
WHERE NOT EXISTS (
    SELECT 1 FROM approval_steps a
    WHERE a.target_type = 'proposal' AND a.target_id = s.proposal_id AND a.step_order = s.step_order
)
ORDER BY s.proposal_id, s.step_order
"""

VERIFY_SQL = """
SELECT
  (SELECT count(*) FROM proposal_approval_steps) AS old_total,
  (SELECT count(*) FROM approval_steps WHERE target_type = 'proposal') AS new_total,
  (SELECT count(*) FROM (
      SELECT proposal_id AS pid, step_order, title::text, approver_id, status::text FROM proposal_approval_steps
      EXCEPT
      SELECT target_id, step_order, title::text, approver_id, status::text FROM approval_steps WHERE target_type = 'proposal'
  ) missing) AS missing
"""


def copy_proposal_steps(bind) -> int:
    """옛 테이블의 품의서 결재 단계를 공용 테이블로 복사하고 검증한다. 복사한 행 수를 돌려준다 (테스트에서도 사용)."""
    copied = bind.execute(text(COPY_SQL)).rowcount
    old_total, new_total, missing = bind.execute(text(VERIFY_SQL)).one()
    if missing or old_total != new_total:
        raise RuntimeError(
            f"품의서 결재 단계 이전 검증 실패: 옛 테이블 {old_total}행, 공용 테이블 {new_total}행, 누락 {missing}행. 아무것도 바꾸지 않습니다."
        )
    return copied


def upgrade() -> None:
    copy_proposal_steps(op.get_bind())


def downgrade() -> None:
    # 옛 테이블이 남아 있으므로 공용 테이블의 품의서 행만 지우면 이전 상태가 된다.
    # 주의: 통합 이후에 새로 생긴 품의서 결재 단계는 옛 테이블에 없으므로 함께 사라진다.
    op.execute("DELETE FROM approval_steps WHERE target_type = 'proposal'")
