"""발주 결제 확인(proposals.payment_method/payment_card)과 품의서 매입 연결(transactions.proposal_id): 열만 추가.

Revision ID: 0016_order_payment_ledger
Revises: 0015_proposal_vendor_amount
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_order_payment_ledger"
down_revision: Union[str, Sequence[str], None] = "0015_proposal_vendor_amount"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("payment_method", sa.String(length=20), nullable=True))
    op.add_column("proposals", sa.Column("payment_card", sa.String(length=20), nullable=True))
    op.add_column("transactions", sa.Column("proposal_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transactions_proposal_id", "transactions", "proposals", ["proposal_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_transactions_proposal_id", "transactions", ["proposal_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_proposal_id", table_name="transactions")
    op.drop_constraint("fk_transactions_proposal_id", "transactions", type_="foreignkey")
    op.drop_column("transactions", "proposal_id")
    op.drop_column("proposals", "payment_card")
    op.drop_column("proposals", "payment_method")
