"""proposals.vendor_name / amount / currency: 구매 품의서의 거래처명·금액 (열만 추가, 기존 품의서는 비어 있음).

Revision ID: 0015_proposal_vendor_amount
Revises: 0014_attachment_doc_kind
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_proposal_vendor_amount"
down_revision: Union[str, Sequence[str], None] = "0014_attachment_doc_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("vendor_name", sa.String(length=200), nullable=True))
    op.add_column("proposals", sa.Column("amount", sa.Numeric(15, 2), nullable=True))
    op.add_column("proposals", sa.Column("currency", sa.String(length=3), server_default="KRW", nullable=False))


def downgrade() -> None:
    op.drop_column("proposals", "currency")
    op.drop_column("proposals", "amount")
    op.drop_column("proposals", "vendor_name")
