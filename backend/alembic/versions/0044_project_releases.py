"""project_releases / project_release_files: 프로젝트 파일 버전(V.x.xx.xxx)과 항목별 파일.

Revision ID: 0044_project_releases
Revises: 0043_movement_proposal
Create Date: 2026-11-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0044_project_releases"
down_revision: Union[str, Sequence[str], None] = "0043_movement_proposal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_releases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.String(30), nullable=False),
        sa.Column("release_date", sa.Date(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "version", name="uq_project_release_version"),
    )
    op.create_index("ix_project_releases_project_id", "project_releases", ["project_id"])
    op.create_table(
        "project_release_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("release_id", sa.Integer(), sa.ForeignKey("project_releases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("group", sa.String(10), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_release_files_release_id", "project_release_files", ["release_id"])


def downgrade() -> None:
    op.drop_index("ix_project_release_files_release_id", table_name="project_release_files")
    op.drop_table("project_release_files")
    op.drop_index("ix_project_releases_project_id", table_name="project_releases")
    op.drop_table("project_releases")
