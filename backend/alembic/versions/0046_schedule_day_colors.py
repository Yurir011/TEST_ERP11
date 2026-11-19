"""schedule_day_colors: 직원별 캘린더 날짜 칸 색상 (표 추가).

Revision ID: 0046_schedule_day_colors
Revises: 0045_schedule_sticker
Create Date: 2026-11-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0046_schedule_day_colors"
down_revision: Union[str, Sequence[str], None] = "0045_schedule_sticker"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "schedule_day_colors",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("color", sa.String(length=20), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("schedule_day_colors")
