"""project_bom_lines: 프로젝트(제품 생산)별 BOM (필요 자재와 수량).

Revision ID: 0036_project_bom
Revises: 0035_material_reel_groups
Create Date: 2026-11-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0036_project_bom"
down_revision: Union[str, Sequence[str], None] = "0035_material_reel_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_bom_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id", ondelete="SET NULL"), nullable=True),
        sa.Column("item_name", sa.String(200), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_bom_lines_project_id", "project_bom_lines", ["project_id"])
    op.create_index("ix_project_bom_lines_material_id", "project_bom_lines", ["material_id"])


def downgrade() -> None:
    op.drop_index("ix_project_bom_lines_material_id", table_name="project_bom_lines")
    op.drop_index("ix_project_bom_lines_project_id", table_name="project_bom_lines")
    op.drop_table("project_bom_lines")
