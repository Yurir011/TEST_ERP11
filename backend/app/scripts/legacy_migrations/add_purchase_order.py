"""
발주서 추가용 1회성 마이그레이션 스크립트.
- project_documents.doc_type의 Postgres enum 타입(projectdoctype)에 'purchase_order' 값을 추가한다.
- project_documents.remark(발주서 REMARK 칸) 컬럼을 추가한다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로 기존 DB에는 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.add_purchase_order
"""
from sqlalchemy import text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddPurchaseOrder")


def main():
    # ALTER TYPE ... ADD VALUE는 같은 트랜잭션에서 새 값을 쓸 수 없으므로 컬럼 추가와 분리해 각자 커밋한다.
    with engine.begin() as conn:
        conn.execute(text("ALTER TYPE projectdoctype ADD VALUE IF NOT EXISTS 'purchase_order'"))
        logger.debug("[AddPurchaseOrder] projectdoctype enum에 purchase_order 값 추가")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS remark TEXT"))
        logger.debug("[AddPurchaseOrder] project_documents.remark 컬럼 추가")
    print("마이그레이션 완료: projectdoctype에 purchase_order 추가, project_documents.remark 컬럼 추가")


if __name__ == "__main__":
    main()
