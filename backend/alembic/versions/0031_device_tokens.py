"""device_tokens: 모바일 앱 푸시(FCM) 토큰 표 추가. 기존 표는 바꾸지 않는다.

Revision ID: 0031_device_tokens
Revises: 0030_card_owner_delegates
Create Date: 2026-11-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0031_device_tokens"
down_revision: Union[str, Sequence[str], None] = "0030_card_owner_delegates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "device_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=512), nullable=False),
        sa.Column("platform", sa.String(length=10), nullable=False),
        sa.Column("device_name", sa.String(length=100), nullable=True),
        sa.Column("app_version", sa.String(length=20), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_device_tokens_token"),
    )
    op.create_index("ix_device_tokens_user_id", "device_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("device_tokens")
