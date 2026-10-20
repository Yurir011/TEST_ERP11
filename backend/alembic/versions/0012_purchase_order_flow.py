"""구매 품의서 발주·입고 흐름: 발주서의 원본 품의서 연결, 품의서의 발송·입고 확인 열 추가 (열만 추가, 기존 데이터는 그대로).

Revision ID: 0012_purchase_order_flow
Revises: 0011_project_date_notes
Create Date: 2026-10-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_purchase_order_flow"
down_revision: Union[str, Sequence[str], None] = "0011_project_date_notes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_documents", sa.Column("proposal_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_project_documents_proposal_id"), "project_documents", ["proposal_id"], unique=False)
    op.create_foreign_key("fk_project_documents_proposal_id", "project_documents", "proposals", ["proposal_id"], ["id"], ondelete="SET NULL")

    op.add_column("proposals", sa.Column("order_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("proposals", sa.Column("order_sent_by", sa.Integer(), nullable=True))
    op.add_column("proposals", sa.Column("received_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("proposals", sa.Column("received_by", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_proposals_order_sent_by", "proposals", "users", ["order_sent_by"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_proposals_received_by", "proposals", "users", ["received_by"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_proposals_received_by", "proposals", type_="foreignkey")
    op.drop_constraint("fk_proposals_order_sent_by", "proposals", type_="foreignkey")
    op.drop_column("proposals", "received_by")
    op.drop_column("proposals", "received_at")
    op.drop_column("proposals", "order_sent_by")
    op.drop_column("proposals", "order_sent_at")

    op.drop_constraint("fk_project_documents_proposal_id", "project_documents", type_="foreignkey")
    op.drop_index(op.f("ix_project_documents_proposal_id"), table_name="project_documents")
    op.drop_column("project_documents", "proposal_id")
