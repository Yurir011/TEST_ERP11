"""withdrawn status: 연차·증명서·품의서 상태 enum 에 'withdrawn'(회수됨)을 추가한다.

PostgreSQL 은 enum 에 추가한 값을 같은 트랜잭션 안에서 바로 쓸 수 없어서 자동 커밋 구간에서 실행한다(0004 와 같은 방식).
견적서·거래명세서·세금계산서·발주서는 기존 'draft'(작성 중) 상태로 되돌리므로 바꾸지 않는다.

Revision ID: 0026_withdrawn_status
Revises: 0025_document_kind_label
Create Date: 2026-11-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0026_withdrawn_status"
down_revision: Union[str, Sequence[str], None] = "0025_document_kind_label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ENUMS = ("leavestatus", "documentstatus", "proposalstatus")


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for name in _ENUMS:
            op.execute(f"ALTER TYPE {name} ADD VALUE IF NOT EXISTS 'withdrawn'")


def downgrade() -> None:
    # PostgreSQL 은 enum 값을 지울 수 없다. 값이 남아 있어도 쓰는 행이 없으면 동작에 영향이 없다.
    pass
