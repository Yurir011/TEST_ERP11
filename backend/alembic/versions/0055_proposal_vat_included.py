"""proposals.vat_included: 품의서에 적은 금액이 부가세 포함인지 (기본은 부가세 별도).

Revision ID: 0055_proposal_vat_included
Revises: 0054_project_deliveries
Create Date: 2026-11-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0055_proposal_vat_included"
down_revision: Union[str, Sequence[str], None] = "0054_project_deliveries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("vat_included", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("proposals", "vat_included")
