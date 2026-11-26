"""project_deliveries: 프로젝트(회차)별 납품 기록(납품일·수량·메모). 연간 납품 통계의 원본.

Revision ID: 0054_project_deliveries
Revises: 0053_project_round_label
Create Date: 2026-11-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0054_project_deliveries"
down_revision: Union[str, Sequence[str], None] = "0053_project_round_label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delivered_on", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("memo", sa.String(300), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_deliveries_project_id", "project_deliveries", ["project_id"])
    op.create_index("ix_project_deliveries_delivered_on", "project_deliveries", ["delivered_on"])


def downgrade() -> None:
    op.drop_index("ix_project_deliveries_delivered_on", table_name="project_deliveries")
    op.drop_index("ix_project_deliveries_project_id", table_name="project_deliveries")
    op.drop_table("project_deliveries")
