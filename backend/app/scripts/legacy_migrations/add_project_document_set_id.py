"""
project_documents 테이블에 견적서+거래명세서 묶음 식별자(set_id) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블 구조를 바꾸려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv/Scripts/python.exe -m app.scripts.add_project_document_set_id

동작:
  - project_documents.set_id 컬럼 추가 (없는 경우, INTEGER, NULL 허용) + 인덱스
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddProjectDocumentSetId")

TABLE = "project_documents"


def main():
    columns = {col["name"] for col in inspect(engine).get_columns(TABLE)}
    with engine.begin() as conn:
        if "set_id" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN set_id INTEGER"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{TABLE}_set_id ON {TABLE} (set_id)"))
            logger.debug(f"[AddProjectDocumentSetId] {TABLE}.set_id 컬럼 추가")
    print(f"마이그레이션 완료: {TABLE}.set_id 컬럼 반영")


if __name__ == "__main__":
    main()
