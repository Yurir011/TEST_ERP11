"""transaction_files: 매입매출 한 건에 붙인 세금계산서 파일.

Revision ID: 0042_transaction_files
Revises: 0041_transaction_items
Create Date: 2026-11-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0042_transaction_files"
down_revision: Union[str, Sequence[str], None] = "0041_transaction_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transaction_files_transaction_id", "transaction_files", ["transaction_id"])


def downgrade() -> None:
    op.drop_index("ix_transaction_files_transaction_id", table_name="transaction_files")
    op.drop_table("transaction_files")
