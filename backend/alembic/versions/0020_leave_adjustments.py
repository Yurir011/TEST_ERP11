"""leave_adjustments: 관리자의 연차 일수 조정 내역 (새 표 추가).

Revision ID: 0020_leave_adjustments
Revises: 0019_proposal_payment_ledger
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020_leave_adjustments"
down_revision: Union[str, Sequence[str], None] = "0019_proposal_payment_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "leave_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_leave_adjustments_user_id", "leave_adjustments", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_leave_adjustments_user_id", table_name="leave_adjustments")
    op.drop_table("leave_adjustments")
