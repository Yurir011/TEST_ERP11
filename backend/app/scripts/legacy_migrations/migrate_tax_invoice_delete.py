"""세금계산서 삭제 결재(승인된 세금계산서를 결재를 거쳐 삭제)를 위해 project_documents 테이블에 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_tax_invoice_delete

동작:
  - project_documents.delete_requested 컬럼 추가 (없는 경우, BOOLEAN NOT NULL DEFAULT false)
  - project_documents.delete_prev_steps 컬럼 추가 (없는 경우, JSON, nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTaxInvoiceDelete")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("project_documents")}
    with engine.begin() as conn:
        if "delete_requested" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN delete_requested BOOLEAN NOT NULL DEFAULT false"))
            logger.debug("[MigrateTaxInvoiceDelete] project_documents.delete_requested 컬럼 추가")
        if "delete_prev_steps" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN delete_prev_steps JSON"))
            logger.debug("[MigrateTaxInvoiceDelete] project_documents.delete_prev_steps 컬럼 추가")
    print("마이그레이션 완료: 세금계산서 삭제 결재 컬럼 반영")


if __name__ == "__main__":
    main()
