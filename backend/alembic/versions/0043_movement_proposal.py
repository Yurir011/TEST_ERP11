"""material_movements.proposal_id: 구매 품의서 입고로 생긴 입고 기록이 어느 품의서 것인지.

Revision ID: 0043_movement_proposal
Revises: 0042_transaction_files
Create Date: 2026-11-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0043_movement_proposal"
down_revision: Union[str, Sequence[str], None] = "0042_transaction_files"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_movements", sa.Column("proposal_id", sa.Integer(), sa.ForeignKey("proposals.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_material_movements_proposal_id", "material_movements", ["proposal_id"])


def downgrade() -> None:
    op.drop_index("ix_material_movements_proposal_id", table_name="material_movements")
    op.drop_column("material_movements", "proposal_id")
