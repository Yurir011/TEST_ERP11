"""project_date_notes.parent_id: 날짜별 메모의 답글 (열만 추가, 기존 메모는 모두 원 메모).

Revision ID: 0018_date_note_reply
Revises: 0017_proposal_project
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_date_note_reply"
down_revision: Union[str, Sequence[str], None] = "0017_proposal_project"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_date_notes", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_project_date_notes_parent_id", "project_date_notes", "project_date_notes", ["parent_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_project_date_notes_parent_id", "project_date_notes", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_project_date_notes_parent_id", table_name="project_date_notes")
    op.drop_constraint("fk_project_date_notes_parent_id", "project_date_notes", type_="foreignkey")
    op.drop_column("project_date_notes", "parent_id")
