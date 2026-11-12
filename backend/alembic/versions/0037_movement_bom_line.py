"""material_movements.bom_line_id: 프로젝트 BOM 줄에서 출고한 기록을 그 줄과 연결한다.

Revision ID: 0037_movement_bom_line
Revises: 0036_project_bom
Create Date: 2026-11-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0037_movement_bom_line"
down_revision: Union[str, Sequence[str], None] = "0036_project_bom"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_movements", sa.Column("bom_line_id", sa.Integer(), sa.ForeignKey("project_bom_lines.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_material_movements_bom_line_id", "material_movements", ["bom_line_id"])


def downgrade() -> None:
    op.drop_index("ix_material_movements_bom_line_id", table_name="material_movements")
    op.drop_column("material_movements", "bom_line_id")
