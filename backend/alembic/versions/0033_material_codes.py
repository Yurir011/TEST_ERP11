"""materials.kind/code, material_movements.reels/per_reel: 회로부품 전용·범용, 품목 코드(EC-0001…), 릴 단위 입출고.

기존 회로부품은 모두 전용(EC)으로 옮기고, 등록 순서대로 코드를 부여한다.

Revision ID: 0033_material_codes
Revises: 0032_materials
Create Date: 2026-11-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0033_material_codes"
down_revision: Union[str, Sequence[str], None] = "0032_materials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("materials", sa.Column("kind", sa.String(length=10), nullable=True))
    op.add_column("materials", sa.Column("code", sa.String(length=40), nullable=True))
    op.add_column("material_movements", sa.Column("reels", sa.Integer(), nullable=True))
    op.add_column("material_movements", sa.Column("per_reel", sa.Integer(), nullable=True))

    op.execute("UPDATE materials SET kind = 'dedicated' WHERE category = 'ic'")
    op.execute(
        """
        UPDATE materials m SET code = t.prefix || '-' || lpad(t.n::text, 4, '0')
        FROM (
            SELECT id,
                   CASE category WHEN 'ic' THEN 'EC' WHEN 'injection' THEN 'ME' WHEN 'subsidiary' THEN 'SU'
                                 WHEN 'packaging' THEN 'PK' ELSE 'CS' END AS prefix,
                   row_number() OVER (PARTITION BY category ORDER BY id) AS n
            FROM materials
        ) t
        WHERE m.id = t.id
        """
    )
    op.alter_column("materials", "code", nullable=False)
    op.create_index(op.f("ix_materials_code"), "materials", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_materials_code"), table_name="materials")
    op.drop_column("material_movements", "per_reel")
    op.drop_column("material_movements", "reels")
    op.drop_column("materials", "code")
    op.drop_column("materials", "kind")
