"""
project_documents 테이블에 팝빌 세금계산서 발행 상태 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_document_popbill

동작:
  - project_documents.popbill_mgt_key 컬럼 추가 (없는 경우, VARCHAR(24), nullable)
  - project_documents.popbill_nts_confirm_num 컬럼 추가 (없는 경우, VARCHAR(50), nullable) - 국세청 승인번호
  - project_documents.popbill_issued_at 컬럼 추가 (없는 경우, TIMESTAMPTZ, nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectDocumentPopbill")

TABLE = "project_documents"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "popbill_mgt_key" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN popbill_mgt_key VARCHAR(24)"))
            logger.debug(f"[MigrateProjectDocumentPopbill] {TABLE}.popbill_mgt_key 컬럼 추가")
        if "popbill_nts_confirm_num" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN popbill_nts_confirm_num VARCHAR(50)"))
            logger.debug(f"[MigrateProjectDocumentPopbill] {TABLE}.popbill_nts_confirm_num 컬럼 추가")
        if "popbill_issued_at" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN popbill_issued_at TIMESTAMPTZ"))
            logger.debug(f"[MigrateProjectDocumentPopbill] {TABLE}.popbill_issued_at 컬럼 추가")

    print(f"마이그레이션 완료: {TABLE}.popbill_* 컬럼 반영")


if __name__ == "__main__":
    main()
