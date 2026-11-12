"""project_bom_lines.pending_units: 재고 부족으로 출고에서 빠진 제품 개수(나중에 따로 출고할 보류분).

Revision ID: 0038_bom_pending_units
Revises: 0037_movement_bom_line
Create Date: 2026-11-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0038_bom_pending_units"
down_revision: Union[str, Sequence[str], None] = "0037_movement_bom_line"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_bom_lines", sa.Column("pending_units", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("project_bom_lines", "pending_units")
