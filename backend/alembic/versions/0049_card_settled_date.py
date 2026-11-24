"""payments.card_settled_date: 카드 결제일 일괄처리한 실제 결제일. 일괄처리해도 입출금 날짜(payment_date)는 사용일 그대로 둔다.

이미 일괄처리된 내역(card_pending=false 이고 card_used_date 가 있는 카드 출금)은 결제일을 card_settled_date 로 옮기고
payment_date 를 사용일로 되돌린다.

Revision ID: 0049_card_settled_date
Revises: 0048_user_ui_theme
Create Date: 2026-11-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0049_card_settled_date"
down_revision: Union[str, Sequence[str], None] = "0048_user_ui_theme"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("card_settled_date", sa.Date(), nullable=True))
    op.execute(
        "UPDATE payments SET card_settled_date = payment_date, payment_date = card_used_date "
        "WHERE card_pending = false AND card_used_date IS NOT NULL AND card_type IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE payments SET payment_date = card_settled_date WHERE card_settled_date IS NOT NULL"
    )
    op.drop_column("payments", "card_settled_date")
