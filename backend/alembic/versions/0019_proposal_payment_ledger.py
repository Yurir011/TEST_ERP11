"""proposals.payment_bank / payment_id: 입금 계좌와 자동으로 만든 출금 연결 (열만 추가).

Revision ID: 0019_proposal_payment_ledger
Revises: 0018_date_note_reply
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_proposal_payment_ledger"
down_revision: Union[str, Sequence[str], None] = "0018_date_note_reply"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("payment_bank", sa.String(length=20), nullable=True))
    op.add_column("proposals", sa.Column("payment_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_proposals_payment_id", "proposals", "payments", ["payment_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_proposals_payment_id", "proposals", type_="foreignkey")
    op.drop_column("proposals", "payment_id")
    op.drop_column("proposals", "payment_bank")
