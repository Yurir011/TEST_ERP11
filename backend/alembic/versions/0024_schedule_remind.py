"""schedule_events.remind_days_before: 일정 알림(팝업) 시점 (열만 추가).

Revision ID: 0024_schedule_remind
Revises: 0023_payment_counterparty
Create Date: 2026-11-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_schedule_remind"
down_revision: Union[str, Sequence[str], None] = "0023_payment_counterparty"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schedule_events", sa.Column("remind_days_before", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("schedule_events", "remind_days_before")
