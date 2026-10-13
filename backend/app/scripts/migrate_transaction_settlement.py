"""매입매출(transactions)에 외상/결제완료 상태 컬럼을 추가하는 1회성 마이그레이션. 서버 시작 시에도 자동으로 호출되며 여러 번 실행해도 안전하다.

  - settled BOOLEAN NOT NULL (기존 내역은 모두 결제완료로 간주해 true, 이후 새 내역의 기본값은 false)
  - settled_date DATE
  - settled_payment_id INTEGER (payments.id)

사용법: backend 폴더에서  venv\\Scripts\\python.exe -m app.scripts.migrate_transaction_settlement
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

logger = get_logger("MigrateTransactionSettlement")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("transactions")}
    with engine.begin() as conn:
        if "settled" not in columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN settled BOOLEAN NOT NULL DEFAULT true"))
            conn.execute(text("ALTER TABLE transactions ALTER COLUMN settled SET DEFAULT false"))
            logger.debug("[MigrateTransactionSettlement] transactions.settled 추가 (기존 내역은 결제완료로 설정)")
        if "settled_date" not in columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN settled_date DATE"))
            logger.debug("[MigrateTransactionSettlement] transactions.settled_date 추가")
        if "settled_payment_id" not in columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN settled_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL"))
            logger.debug("[MigrateTransactionSettlement] transactions.settled_payment_id 추가")


if __name__ == "__main__":
    setup_logging()
    main()
    print("마이그레이션 완료: 매입매출 외상/결제완료 컬럼 반영")
