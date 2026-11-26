"""projects.round_label: 회차 탭에 보여 줄 이름(직접 지정). 비어 있으면 "N회차"로 보여 준다.

Revision ID: 0053_project_round_label
Revises: 0052_payment_foreign
Create Date: 2026-11-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0053_project_round_label"
down_revision: Union[str, Sequence[str], None] = "0052_payment_foreign"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("round_label", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "round_label")
