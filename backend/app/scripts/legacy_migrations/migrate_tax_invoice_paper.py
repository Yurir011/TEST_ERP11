"""종이로 받은 매입 세금계산서를 구분하기 위해 project_documents 테이블에 is_paper 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.migrate_tax_invoice_paper

동작:
  - project_documents.is_paper 컬럼 추가 (없는 경우, BOOLEAN NOT NULL DEFAULT false)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTaxInvoicePaper")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("project_documents")}
    with engine.begin() as conn:
        if "is_paper" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN is_paper BOOLEAN NOT NULL DEFAULT false"))
            logger.debug("[MigrateTaxInvoicePaper] project_documents.is_paper 컬럼 추가")
        else:
            logger.debug("[MigrateTaxInvoicePaper] is_paper 컬럼이 이미 있어 건너뜀")
    print("마이그레이션 완료: 종이 세금계산서 구분 컬럼(is_paper) 반영")


if __name__ == "__main__":
    main()
