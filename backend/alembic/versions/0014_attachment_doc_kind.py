"""proposal_attachments.doc_kind: 첨부 파일의 서류 종류(거래명세서·세금계산서) 열 추가 (열만 추가, 기존 첨부는 종류 없음으로 그대로).

Revision ID: 0014_attachment_doc_kind
Revises: 0013_message_deleted_at
Create Date: 2026-10-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_attachment_doc_kind"
down_revision: Union[str, Sequence[str], None] = "0013_message_deleted_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposal_attachments", sa.Column("doc_kind", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("proposal_attachments", "doc_kind")
