"""project_date_notes: 프로젝트 날짜별 메모 표 추가 (새 표만 추가, 기존 표는 바꾸지 않는다).

Revision ID: 0011_project_date_notes
Revises: 0010_mail_logs
Create Date: 2026-10-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_project_date_notes"
down_revision: Union[str, Sequence[str], None] = "0010_mail_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_date_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("note_date", sa.Date(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_date_notes_project_date", "project_date_notes", ["project_id", "note_date"])


def downgrade() -> None:
    op.drop_index("ix_project_date_notes_project_date", table_name="project_date_notes")
    op.drop_table("project_date_notes")
