"""material_movements.reel_groups: 릴마다 개수가 다를 때 "개수 × 릴 수" 묶음으로 기록 (per_reel 칸을 대신한다).

기존에 "1릴 당 개수"(per_reel)로 기록한 입출고는 같은 개수의 릴 한 묶음 [{per_reel, reels}] 으로 옮긴다.

Revision ID: 0035_material_reel_groups
Revises: 0034_material_returns
Create Date: 2026-11-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0035_material_reel_groups"
down_revision: Union[str, Sequence[str], None] = "0034_material_returns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_movements", sa.Column("reel_groups", postgresql.JSONB(), nullable=True))
    op.execute(
        """
        UPDATE material_movements
        SET reel_groups = jsonb_build_array(jsonb_build_object('per_reel', per_reel, 'reels', reels))
        WHERE reels IS NOT NULL AND per_reel IS NOT NULL
        """
    )
    op.drop_column("material_movements", "per_reel")


def downgrade() -> None:
    op.add_column("material_movements", sa.Column("per_reel", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE material_movements
        SET per_reel = (reel_groups -> 0 ->> 'per_reel')::int
        WHERE reel_groups IS NOT NULL
        """
    )
    op.drop_column("material_movements", "reel_groups")
