"""
project_documents 테이블에 세금계산서 상대방(거래처) 정보 컬럼(counterparty_info, JSON)을 추가하는 1회성 마이그레이션 스크립트.
세금계산서 사진에서 인식한 거래처 대표자/사업자번호/주소 등을 거래처관리 등록 여부와 상관없이 문서에 저장해 양식 출력에 쓰기 위함이다.

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.migrate_tax_invoice_counterparty
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTaxInvoiceCounterparty")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("project_documents")}
    with engine.begin() as conn:
        if "counterparty_info" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN counterparty_info JSON"))
            logger.debug("[MigrateTaxInvoiceCounterparty] counterparty_info 컬럼 추가")
    print("마이그레이션 완료: project_documents.counterparty_info 컬럼 반영")


if __name__ == "__main__":
    main()
