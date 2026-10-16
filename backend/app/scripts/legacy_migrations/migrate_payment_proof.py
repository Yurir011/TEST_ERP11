"""
payments 테이블에 계좌이체 건 증빙(세금계산서/지출증빙영수증/간이영수증/기타) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_payment_proof

동작:
  - prooftype enum 타입 생성 (없는 경우)
  - payments.proof_type, payments.proof_type_detail 컬럼 추가 (없는 경우)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigratePaymentProof")


def _enum_type_exists(conn, type_name: str) -> bool:
    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": type_name})
    return result.first() is not None


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("payments")}

    with engine.begin() as conn:
        if not _enum_type_exists(conn, "prooftype"):
            conn.execute(text(
                "CREATE TYPE prooftype AS ENUM ('tax_invoice', 'expense_receipt', 'simple_receipt', 'other')"
            ))
            logger.debug("[MigratePaymentProof] prooftype enum 타입 생성")

        if "proof_type" not in columns:
            conn.execute(text("ALTER TABLE payments ADD COLUMN proof_type prooftype"))
            logger.debug("[MigratePaymentProof] proof_type 컬럼 추가")

        if "proof_type_detail" not in columns:
            conn.execute(text("ALTER TABLE payments ADD COLUMN proof_type_detail VARCHAR(200)"))
            logger.debug("[MigratePaymentProof] proof_type_detail 컬럼 추가")

    print("마이그레이션 완료: payments.proof_type / proof_type_detail 컬럼 반영")


if __name__ == "__main__":
    main()
