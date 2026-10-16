"""부분 수금/지급을 위한 컬럼을 추가하는 1회성 마이그레이션. 서버 시작 시에도 자동으로 호출되며 여러 번 실행해도 안전하다.

  - transactions.paid_amount BIGINT NOT NULL DEFAULT 0 (부분 수금/지급으로 이미 받은(준) 금액)
  - payments.partial_transaction_id INTEGER (transactions.id, 매입매출 일부만 결제한 입출금)

사용법: backend 폴더에서  venv\\Scripts\\python.exe -m app.scripts.migrate_transaction_paid_amount
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

logger = get_logger("MigrateTransactionPaidAmount")


def main():
    inspector = inspect(engine)
    tx_columns = {col["name"] for col in inspector.get_columns("transactions")}
    payment_columns = {col["name"] for col in inspector.get_columns("payments")}
    with engine.begin() as conn:
        if "paid_amount" not in tx_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN paid_amount BIGINT NOT NULL DEFAULT 0"))
            logger.debug("[MigrateTransactionPaidAmount] transactions.paid_amount 추가")
        if "partial_transaction_id" not in payment_columns:
            conn.execute(
                text("ALTER TABLE payments ADD COLUMN partial_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL")
            )
            logger.debug("[MigrateTransactionPaidAmount] payments.partial_transaction_id 추가")


if __name__ == "__main__":
    setup_logging()
    main()
    print("마이그레이션 완료: 부분 수금/지급 컬럼 반영")
