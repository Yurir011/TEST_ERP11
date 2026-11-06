"""contacts: 연락처(전 직원 공유 주소록) 표 추가. 기존 표는 바꾸지 않는다.

거래처 담당자 중 휴대폰 번호가 있는 사람은 이 표에 한 번 옮겨 담는다 (이후에는 거래처를 저장할 때마다 자동 반영).

Revision ID: 0028_contacts
Revises: 0027_passkey_credentials
Create Date: 2026-11-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0028_contacts"
down_revision: Union[str, Sequence[str], None] = "0027_passkey_credentials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("company_name", sa.String(length=200), nullable=True),
        sa.Column("title", sa.String(length=100), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("phone2", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contacts_name"), "contacts", ["name"])
    op.create_index(op.f("ix_contacts_client_id"), "contacts", ["client_id"])

    # 이미 등록된 거래처 담당자 중 휴대폰 번호가 있는 사람을 연락처로 옮겨 담는다
    op.execute(
        """
        INSERT INTO contacts (name, client_id, company_name, title, phone, phone2, email, created_by)
        SELECT cc.name, c.id, c.name, cc.title, cc.mobile_phone, cc.landline_phone, cc.email, c.created_by
        FROM client_contacts cc JOIN clients c ON c.id = cc.client_id
        WHERE cc.mobile_phone IS NOT NULL AND btrim(cc.mobile_phone) <> ''
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_contacts_client_id"), table_name="contacts")
    op.drop_index(op.f("ix_contacts_name"), table_name="contacts")
    op.drop_table("contacts")
