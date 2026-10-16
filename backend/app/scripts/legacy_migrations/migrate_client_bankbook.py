"""
clients 테이블에 통장사본 첨부 경로 컬럼(bankbook_image_path)을 추가하는 1회성 마이그레이션 스크립트.

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.migrate_client_bankbook
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateClientBankbook")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("clients")}
    with engine.begin() as conn:
        if "bankbook_image_path" not in columns:
            conn.execute(text("ALTER TABLE clients ADD COLUMN bankbook_image_path VARCHAR(500)"))
            logger.debug("[MigrateClientBankbook] bankbook_image_path 컬럼 추가")
    print("마이그레이션 완료: clients.bankbook_image_path 컬럼 반영")


if __name__ == "__main__":
    main()
