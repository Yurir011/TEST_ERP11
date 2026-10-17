"""messenger_favorites, user_presence: 메신저 즐겨찾기와 직원 상태 표 추가 (새 표만 추가, 기존 표는 바꾸지 않는다).

Revision ID: 0009_favorites_presence
Revises: 0008_messenger
Create Date: 2026-10-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_favorites_presence"
down_revision: Union[str, Sequence[str], None] = "0008_messenger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "messenger_favorites",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("favorite_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("user_id <> favorite_user_id", name="ck_messenger_favorite_not_self"),
        sa.ForeignKeyConstraint(["favorite_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "favorite_user_id"),
    )
    op.create_table(
        "user_presence",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("status_date", sa.Date(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_presence")
    op.drop_table("messenger_favorites")
