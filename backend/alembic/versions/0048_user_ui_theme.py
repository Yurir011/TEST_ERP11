"""users.ui_theme: 직원이 고른 화면 색 테마 (열만 추가).

Revision ID: 0048_user_ui_theme
Revises: 0047_contact_favorites
Create Date: 2026-11-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0048_user_ui_theme"
down_revision: Union[str, Sequence[str], None] = "0047_contact_favorites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ui_theme", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ui_theme")
