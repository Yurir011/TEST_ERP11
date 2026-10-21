"""payments.counterparty: 등록되지 않은 거래처 이름을 직접 입력한 경우 그 이름 (열만 추가).

Revision ID: 0023_payment_counterparty
Revises: 0022_date_note_edited
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023_payment_counterparty"
down_revision: Union[str, Sequence[str], None] = "0022_date_note_edited"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("counterparty", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "counterparty")
