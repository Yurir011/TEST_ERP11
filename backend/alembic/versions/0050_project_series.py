"""projects.series_id: 같은 프로젝트의 반복(회차) 묶음. 기존 프로젝트는 모두 단독(NULL)으로 둔다.

Revision ID: 0050_project_series
Revises: 0049_card_settled_date
Create Date: 2026-11-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0050_project_series"
down_revision: Union[str, Sequence[str], None] = "0049_card_settled_date"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("series_id", sa.Integer(), nullable=True))
    op.create_index("ix_projects_series_id", "projects", ["series_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_series_id", table_name="projects")
    op.drop_column("projects", "series_id")
