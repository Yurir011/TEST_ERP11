"""
project_documents 테이블에 purpose_type 컬럼을 추가하는 1회성 마이그레이션 스크립트.
세금계산서 작성 시 "청구"/"영수"를 선택할 수 있도록 하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_document_purpose_type

동작:
  - project_documents.purpose_type 컬럼 추가 (없는 경우, VARCHAR(10), 기본값 '청구')
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectDocumentPurposeType")

TABLE = "project_documents"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "purpose_type" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN purpose_type VARCHAR(10) NOT NULL DEFAULT '청구'"))
            logger.debug(f"[MigrateProjectDocumentPurposeType] {TABLE}.purpose_type 컬럼 추가")

    print(f"마이그레이션 완료: {TABLE}.purpose_type 컬럼 반영")


if __name__ == "__main__":
    main()
