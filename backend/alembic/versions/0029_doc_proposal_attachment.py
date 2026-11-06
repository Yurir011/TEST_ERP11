"""project_documents.proposal_attachment_id: 구매 품의서 첨부(세금계산서)에서 자동 등록된 문서 표시 칸 추가. 기존 데이터는 바꾸지 않는다.

Revision ID: 0029_doc_proposal_attachment
Revises: 0028_contacts
Create Date: 2026-11-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0029_doc_proposal_attachment"
down_revision: Union[str, Sequence[str], None] = "0028_contacts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_documents", sa.Column("proposal_attachment_id", sa.Integer(), nullable=True))
    op.create_index("ix_project_documents_proposal_attachment_id", "project_documents", ["proposal_attachment_id"])
    op.create_foreign_key(
        "fk_project_documents_proposal_attachment_id",
        "project_documents",
        "proposal_attachments",
        ["proposal_attachment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_project_documents_proposal_attachment_id", "project_documents", type_="foreignkey")
    op.drop_index("ix_project_documents_proposal_attachment_id", table_name="project_documents")
    op.drop_column("project_documents", "proposal_attachment_id")
