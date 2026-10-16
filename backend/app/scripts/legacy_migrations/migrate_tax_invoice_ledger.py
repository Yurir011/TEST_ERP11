"""세금계산서가 결재 승인되면 팝빌 발행 여부와 무관하게 매입매출관리/입출금관리에 자동 기록되도록
project_documents 테이블에 연동 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_tax_invoice_ledger

동작:
  - project_documents.ledger_transaction_id 컬럼 추가 (없는 경우, INTEGER, transactions.id 참조)
  - project_documents.payment_recorded 컬럼 추가 (없는 경우, BOOLEAN NOT NULL DEFAULT false)
  - project_documents.payment_received_hint 컬럼 추가 (없는 경우, BOOLEAN, nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTaxInvoiceLedger")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("project_documents")}

    with engine.begin() as conn:
        if "ledger_transaction_id" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE project_documents ADD COLUMN ledger_transaction_id INTEGER REFERENCES transactions(id)"
                )
            )
            logger.debug("[MigrateTaxInvoiceLedger] project_documents.ledger_transaction_id 컬럼 추가")

        if "payment_recorded" not in columns:
            conn.execute(
                text("ALTER TABLE project_documents ADD COLUMN payment_recorded BOOLEAN NOT NULL DEFAULT false")
            )
            logger.debug("[MigrateTaxInvoiceLedger] project_documents.payment_recorded 컬럼 추가")

        if "payment_received_hint" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN payment_received_hint BOOLEAN"))
            logger.debug("[MigrateTaxInvoiceLedger] project_documents.payment_received_hint 컬럼 추가")

    print("마이그레이션 완료: 세금계산서 매입매출/입출금 자동 연동 컬럼 반영")


if __name__ == "__main__":
    main()
