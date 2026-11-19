"""contact_favorites: 직원별 연락처 즐겨찾기 (표 추가).

Revision ID: 0047_contact_favorites
Revises: 0046_schedule_day_colors
Create Date: 2026-11-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0047_contact_favorites"
down_revision: Union[str, Sequence[str], None] = "0046_schedule_day_colors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_favorites",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("contact_favorites")
