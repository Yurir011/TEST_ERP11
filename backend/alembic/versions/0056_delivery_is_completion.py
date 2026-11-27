"""project_deliveries.is_completion: [납품완료]와 함께 적은 기록 표시 (완료 취소 때 함께 지운다).

Revision ID: 0056_delivery_is_completion
Revises: 0055_proposal_vat_included
Create Date: 2026-11-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0056_delivery_is_completion"
down_revision: Union[str, Sequence[str], None] = "0055_proposal_vat_included"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_deliveries", sa.Column("is_completion", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("project_deliveries", "is_completion")
