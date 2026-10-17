"""nfc_cards, client_devices: NFC 카드 로그인용 표 추가 (새 표만 추가, 기존 표는 바꾸지 않는다).

Revision ID: 0007_nfc_cards_devices
Revises: 0006_drop_old_proposal_steps
Create Date: 2026-10-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_nfc_cards_devices"
down_revision: Union[str, Sequence[str], None] = "0006_drop_old_proposal_steps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nfc_cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("uid_hmac", sa.String(length=64), nullable=False),
        sa.Column("uid_last4", sa.String(length=4), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("registered_by", sa.Integer(), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["registered_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid_hmac"),
    )
    op.create_index(op.f("ix_nfc_cards_user_id"), "nfc_cards", ["user_id"], unique=False)

    op.create_table(
        "client_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("public_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_key"),
    )
    op.create_index(op.f("ix_client_devices_status"), "client_devices", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_client_devices_status"), table_name="client_devices")
    op.drop_table("client_devices")
    op.drop_index(op.f("ix_nfc_cards_user_id"), table_name="nfc_cards")
    op.drop_table("nfc_cards")
