"""project_documents.kind_label: 세금계산서가 아닌 서류일 때 직접 적는 서류 종류 이름 (열만 추가).

Revision ID: 0025_document_kind_label
Revises: 0024_schedule_remind
Create Date: 2026-11-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025_document_kind_label"
down_revision: Union[str, Sequence[str], None] = "0024_schedule_remind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_documents", sa.Column("kind_label", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("project_documents", "kind_label")
