"""passkey_credentials: 패스키(지문·얼굴 로그인) 저장용 표 추가. 기존 표는 바꾸지 않는다.

Revision ID: 0027_passkey_credentials
Revises: 0026_withdrawn_status
Create Date: 2026-11-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0027_passkey_credentials"
down_revision: Union[str, Sequence[str], None] = "0026_withdrawn_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "passkey_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_passkey_credentials_credential_id"), "passkey_credentials", ["credential_id"], unique=True)
    op.create_index(op.f("ix_passkey_credentials_user_id"), "passkey_credentials", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_passkey_credentials_user_id"), table_name="passkey_credentials")
    op.drop_index(op.f("ix_passkey_credentials_credential_id"), table_name="passkey_credentials")
    op.drop_table("passkey_credentials")
