"""schedule_events.sticker: 일정 스티커(이모지 1개) (열만 추가).

Revision ID: 0045_schedule_sticker
Revises: 0044_project_releases
Create Date: 2026-11-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0045_schedule_sticker"
down_revision: Union[str, Sequence[str], None] = "0044_project_releases"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schedule_events", sa.Column("sticker", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("schedule_events", "sticker")
