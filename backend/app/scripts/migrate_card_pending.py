"""입출금(payments)에 법인카드 결제예정 컬럼을 추가하는 1회성 마이그레이션. 서버 시작 시에도 자동으로 호출되며 여러 번 실행해도 안전하다.

  - card_pending BOOLEAN NOT NULL DEFAULT false (기존 내역은 모두 이미 처리된 것으로 보고 false)
  - card_used_date DATE (카드 결제일에 확정하기 전 원래 사용일)

사용법: backend 폴더에서  venv\\Scripts\\python.exe -m app.scripts.migrate_card_pending
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

logger = get_logger("MigrateCardPending")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("payments")}
    with engine.begin() as conn:
        if "card_pending" not in columns:
            conn.execute(text("ALTER TABLE payments ADD COLUMN card_pending BOOLEAN NOT NULL DEFAULT false"))
            logger.debug("[MigrateCardPending] payments.card_pending 추가 (기존 내역은 확정 상태)")
        if "card_used_date" not in columns:
            conn.execute(text("ALTER TABLE payments ADD COLUMN card_used_date DATE"))
            logger.debug("[MigrateCardPending] payments.card_used_date 추가")


if __name__ == "__main__":
    setup_logging()
    main()
    print("마이그레이션 완료: 입출금 법인카드 결제예정 컬럼 반영")
