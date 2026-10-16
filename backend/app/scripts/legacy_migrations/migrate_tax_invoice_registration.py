"""
project_documents 테이블에 세금계산서 등록용 컬럼(direction, approval_no)을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.
(사진 저장용 project_document_images 테이블은 새 테이블이라 서버 시작 시 create_all이 자동으로 만든다.)

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_tax_invoice_registration
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTaxInvoiceRegistration")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("project_documents")}

    with engine.begin() as conn:
        if "direction" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN direction VARCHAR(10)"))
            logger.debug("[MigrateTaxInvoiceRegistration] direction 컬럼 추가")
        if "approval_no" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN approval_no VARCHAR(50)"))
            logger.debug("[MigrateTaxInvoiceRegistration] approval_no 컬럼 추가")

    print("마이그레이션 완료: project_documents.direction / approval_no 컬럼 반영")


if __name__ == "__main__":
    main()
