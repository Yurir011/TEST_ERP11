"""payment_accounts: 법인카드·계좌를 관리자가 추가·삭제하는 목록으로. 입출금의 카드·계좌 종류 열을 enum 에서 문자열로 바꾼다.

기존 값(bc, kb_kookmin, ibk, woori)은 그대로 code 로 옮겨 담는다 (데이터 변화 없음).

Revision ID: 0021_payment_accounts
Revises: 0020_leave_adjustments
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_payment_accounts"
down_revision: Union[str, Sequence[str], None] = "0020_leave_adjustments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (kind, code, nickname, issuer, pay_day, sort_order)
SEED = [
    ("card", "bc", "BC카드", "BC카드", 23, 1),
    ("card", "kb_kookmin", "KB국민카드", "KB국민카드", 15, 2),
    ("bank", "ibk", "기업은행", "기업은행", None, 1),
    ("bank", "kb_kookmin", "KB국민은행", "KB국민은행", None, 2),
    ("bank", "woori", "우리은행", "우리은행", None, 3),
]


def upgrade() -> None:
    table = op.create_table(
        "payment_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("nickname", sa.String(length=50), nullable=False),
        sa.Column("issuer", sa.String(length=50), nullable=False),
        sa.Column("last4", sa.String(length=4), nullable=True),
        sa.Column("pay_day", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("kind", "code", name="uq_payment_accounts_kind_code"),
    )
    op.create_index("ix_payment_accounts_kind", "payment_accounts", ["kind"])
    op.bulk_insert(
        table,
        [dict(kind=k, code=c, nickname=n, issuer=i, pay_day=d, sort_order=o, is_active=True) for k, c, n, i, d, o in SEED],
    )

    # enum -> varchar (값은 그대로)
    op.execute("ALTER TABLE payments ALTER COLUMN card_type TYPE VARCHAR(40) USING card_type::text")
    op.execute("ALTER TABLE payments ALTER COLUMN bank_type TYPE VARCHAR(40) USING bank_type::text")
    op.execute("ALTER TABLE recurring_payments ALTER COLUMN bank_type TYPE VARCHAR(40) USING bank_type::text")
    op.execute("DROP TYPE IF EXISTS cardtype")
    op.execute("DROP TYPE IF EXISTS banktype")


def downgrade() -> None:
    op.execute("CREATE TYPE cardtype AS ENUM ('bc', 'kb_kookmin')")
    op.execute("CREATE TYPE banktype AS ENUM ('ibk', 'kb_kookmin', 'woori')")
    # 새로 추가한 카드·계좌 값은 되돌릴 수 없으므로 옛 값만 남기고 나머지는 비운다 (recurring 은 기업은행으로)
    op.execute("UPDATE payments SET card_type = NULL WHERE card_type NOT IN ('bc', 'kb_kookmin')")
    op.execute("UPDATE payments SET bank_type = NULL WHERE bank_type NOT IN ('ibk', 'kb_kookmin', 'woori')")
    op.execute("UPDATE recurring_payments SET bank_type = 'ibk' WHERE bank_type NOT IN ('ibk', 'kb_kookmin', 'woori')")
    op.execute("ALTER TABLE payments ALTER COLUMN card_type TYPE cardtype USING card_type::cardtype")
    op.execute("ALTER TABLE payments ALTER COLUMN bank_type TYPE banktype USING bank_type::banktype")
    op.execute("ALTER TABLE recurring_payments ALTER COLUMN bank_type TYPE banktype USING bank_type::banktype")
    op.drop_index("ix_payment_accounts_kind", table_name="payment_accounts")
    op.drop_table("payment_accounts")
