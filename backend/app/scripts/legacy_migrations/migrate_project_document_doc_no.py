"""
project_documents 테이블에 doc_no 컬럼을 추가하는 1회성 마이그레이션 스크립트.
견적서/거래명세서 엑셀 템플릿의 H열 견적번호(MMDD-NN, 당일 발행 순번)를 채워 넣기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_document_doc_no

동작:
  - project_documents.doc_no 컬럼 추가 (없는 경우, VARCHAR(20), nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectDocumentDocNo")

TABLE = "project_documents"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "doc_no" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN doc_no VARCHAR(20)"))
            logger.debug(f"[MigrateProjectDocumentDocNo] {TABLE}.doc_no 컬럼 추가")

    print(f"마이그레이션 완료: {TABLE}.doc_no 컬럼 반영")


if __name__ == "__main__":
    main()
