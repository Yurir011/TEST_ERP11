"""material_movements.return_of/used_qty: 출고했다가 남은 자재의 재입고(반납)와 사용 개수 기록 (로스 자동 계산용). 기존 데이터는 바꾸지 않는다.

Revision ID: 0034_material_returns
Revises: 0033_material_codes
Create Date: 2026-11-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0034_material_returns"
down_revision: Union[str, Sequence[str], None] = "0033_material_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_movements", sa.Column("return_of", sa.Integer(), nullable=True))
    op.add_column("material_movements", sa.Column("used_qty", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_material_movements_return_of", "material_movements", "material_movements", ["return_of"], ["id"])
    op.create_index(op.f("ix_material_movements_return_of"), "material_movements", ["return_of"])


def downgrade() -> None:
    op.drop_index(op.f("ix_material_movements_return_of"), table_name="material_movements")
    op.drop_constraint("fk_material_movements_return_of", "material_movements", type_="foreignkey")
    op.drop_column("material_movements", "used_qty")
    op.drop_column("material_movements", "return_of")
