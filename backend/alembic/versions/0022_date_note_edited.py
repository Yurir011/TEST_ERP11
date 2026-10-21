"""project_date_notes.edited_at: 날짜별 메모·답글을 고친 시각 (열만 추가, 기존 메모는 고치지 않은 것으로).

Revision ID: 0022_date_note_edited
Revises: 0021_payment_accounts
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022_date_note_edited"
down_revision: Union[str, Sequence[str], None] = "0021_payment_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_date_notes", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("project_date_notes", "edited_at")
