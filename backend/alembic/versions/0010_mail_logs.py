"""mail_logs: 문서를 메일로 보낸 기록 표 추가 (새 표만 추가, 기존 표는 바꾸지 않는다. 본문·첨부는 저장하지 않는다).

Revision ID: 0010_mail_logs
Revises: 0009_favorites_presence
Create Date: 2026-10-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_mail_logs"
down_revision: Union[str, Sequence[str], None] = "0009_favorites_presence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mail_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("sender_user_id", sa.Integer(), nullable=True),
        sa.Column("doc_type", sa.String(length=30), nullable=False),
        sa.Column("doc_id", sa.Integer(), nullable=False),
        sa.Column("to_addresses", sa.String(length=1000), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["sender_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mail_logs_doc", "mail_logs", ["doc_type", "doc_id"])


def downgrade() -> None:
    op.drop_index("ix_mail_logs_doc", table_name="mail_logs")
    op.drop_table("mail_logs")
