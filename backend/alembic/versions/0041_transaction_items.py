"""transactions.items: 새 거래 등록의 품목 내역(여러 줄).

Revision ID: 0041_transaction_items
Revises: 0040_project_files
Create Date: 2026-11-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0041_transaction_items"
down_revision: Union[str, Sequence[str], None] = "0040_project_files"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("items", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "items")
