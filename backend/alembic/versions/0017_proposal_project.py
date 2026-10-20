"""proposals.project_id: 구매 품의서가 속한 프로젝트 (열만 추가, 비어 있으면 일반 구매).

Revision ID: 0017_proposal_project
Revises: 0016_order_payment_ledger
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_proposal_project"
down_revision: Union[str, Sequence[str], None] = "0016_order_payment_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_proposals_project_id", "proposals", "projects", ["project_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_proposals_project_id", "proposals", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_proposals_project_id", table_name="proposals")
    op.drop_constraint("fk_proposals_project_id", "proposals", type_="foreignkey")
    op.drop_column("proposals", "project_id")
