"""project_gerbers: 프로젝트에 등록한 거버(PCB 제작용 레이어 파일 묶음, zip)와 버전 이력.

Revision ID: 0039_project_gerbers
Revises: 0038_bom_pending_units
Create Date: 2026-11-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0039_project_gerbers"
down_revision: Union[str, Sequence[str], None] = "0038_bom_pending_units"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_gerbers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.String(20), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("layer_names", postgresql.JSONB(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_gerbers_project_id", "project_gerbers", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_gerbers_project_id", table_name="project_gerbers")
    op.drop_table("project_gerbers")
