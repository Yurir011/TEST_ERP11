"""messages.deleted_at: 보낸 메시지를 지운 시각 열 추가 (열만 추가, 기존 메시지는 그대로).

Revision ID: 0013_message_deleted_at
Revises: 0012_purchase_order_flow
Create Date: 2026-10-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_message_deleted_at"
down_revision: Union[str, Sequence[str], None] = "0012_purchase_order_flow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "deleted_at")
