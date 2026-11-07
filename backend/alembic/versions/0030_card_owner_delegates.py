"""payment_accounts.owner_user_id + payment_account_delegates: 법인카드 소유 직원과 사용 권한을 허용받은 직원. 기존 카드는 소유 직원 없음(공용)으로 그대로 둔다.

Revision ID: 0030_card_owner_delegates
Revises: 0029_doc_proposal_attachment
Create Date: 2026-11-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0030_card_owner_delegates"
down_revision: Union[str, Sequence[str], None] = "0029_doc_proposal_attachment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_accounts", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.create_index("ix_payment_accounts_owner_user_id", "payment_accounts", ["owner_user_id"])
    op.create_foreign_key("fk_payment_accounts_owner_user_id", "payment_accounts", "users", ["owner_user_id"], ["id"], ondelete="SET NULL")
    op.create_table(
        "payment_account_delegates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["payment_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "user_id", name="uq_payment_account_delegates"),
    )
    op.create_index("ix_payment_account_delegates_account_id", "payment_account_delegates", ["account_id"])
    op.create_index("ix_payment_account_delegates_user_id", "payment_account_delegates", ["user_id"])


def downgrade() -> None:
    op.drop_table("payment_account_delegates")
    op.drop_constraint("fk_payment_accounts_owner_user_id", "payment_accounts", type_="foreignkey")
    op.drop_index("ix_payment_accounts_owner_user_id", table_name="payment_accounts")
    op.drop_column("payment_accounts", "owner_user_id")
