"""proposals.settle_amount / settle_rate / no_vat: 외화(달러 등) 구매의 실결제 원화 금액·환율·부가세 없음.

외화 품의서의 amount 는 참고용으로 남기고, 결제 때 수기로 입력한 실결제 원화 금액(제반 비용 포함)으로 매입·입출금을 반영한다.

Revision ID: 0051_proposal_foreign_settle
Revises: 0050_project_series
Create Date: 2026-11-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0051_proposal_foreign_settle"
down_revision: Union[str, Sequence[str], None] = "0050_project_series"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("settle_amount", sa.BigInteger(), nullable=True))
    op.add_column("proposals", sa.Column("settle_rate", sa.Numeric(12, 4), nullable=True))
    op.add_column("proposals", sa.Column("no_vat", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("proposals", "no_vat")
    op.drop_column("proposals", "settle_rate")
    op.drop_column("proposals", "settle_amount")
