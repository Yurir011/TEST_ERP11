"""payments.foreign_currency / foreign_amount / foreign_rate: 법인카드 해외결제의 외화 금액(참고)·환율.

amount 는 항상 원화(장부 기준)다. 해외결제 건은 청구 원화가 나오기 전에는 amount=0("원화 미입력")으로 두고,
원화를 입력하면 그 금액이 장부에 반영된다.

Revision ID: 0052_payment_foreign
Revises: 0051_proposal_foreign_settle
Create Date: 2026-11-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0052_payment_foreign"
down_revision: Union[str, Sequence[str], None] = "0051_proposal_foreign_settle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("foreign_currency", sa.String(3), nullable=True))
    op.add_column("payments", sa.Column("foreign_amount", sa.Numeric(15, 2), nullable=True))
    op.add_column("payments", sa.Column("foreign_rate", sa.Numeric(12, 4), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "foreign_rate")
    op.drop_column("payments", "foreign_amount")
    op.drop_column("payments", "foreign_currency")
