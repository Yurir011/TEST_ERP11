"""
payments 테이블에 card_type(법인카드 종류)/bank_type(계좌 종류) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
법인카드는 BC/KB국민, 계좌이체는 기업/국민/우리 중에서 종류를 구분하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_payment_card_bank_type

동작:
  - cardtype enum 타입 생성 (없는 경우, 'bc', 'kb_kookmin')
  - banktype enum 타입 생성 (없는 경우, 'ibk', 'kb_kookmin', 'woori')
  - payments.card_type / payments.bank_type 컬럼 추가 (없는 경우)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigratePaymentCardBankType")


def _enum_type_exists(conn, type_name: str) -> bool:
    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": type_name})
    return result.first() is not None


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("payments")}

    with engine.begin() as conn:
        if not _enum_type_exists(conn, "cardtype"):
            conn.execute(text("CREATE TYPE cardtype AS ENUM ('bc', 'kb_kookmin')"))
            logger.debug("[MigratePaymentCardBankType] cardtype enum 타입 생성")

        if not _enum_type_exists(conn, "banktype"):
            conn.execute(text("CREATE TYPE banktype AS ENUM ('ibk', 'kb_kookmin', 'woori')"))
            logger.debug("[MigratePaymentCardBankType] banktype enum 타입 생성")

        if "card_type" not in columns:
            conn.execute(text("ALTER TABLE payments ADD COLUMN card_type cardtype"))
            logger.debug("[MigratePaymentCardBankType] card_type 컬럼 추가")

        if "bank_type" not in columns:
            conn.execute(text("ALTER TABLE payments ADD COLUMN bank_type banktype"))
            logger.debug("[MigratePaymentCardBankType] bank_type 컬럼 추가")

    print("마이그레이션 완료: payments.card_type / payments.bank_type 컬럼 반영")


if __name__ == "__main__":
    main()
