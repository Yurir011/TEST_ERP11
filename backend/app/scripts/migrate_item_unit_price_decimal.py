"""
project_document_items.unit_price 컬럼을 BIGINT에서 NUMERIC(18,2)로 바꾸는 1회성 마이그레이션 스크립트.
세금계산서의 단가가 소수(예: 454,545.5)인 경우 수량/단가를 그대로 저장하기 위함이다. 기존 정수 값은 그대로 유지된다.

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.migrate_item_unit_price_decimal
"""
from sqlalchemy import text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateItemUnitPriceDecimal")


def main():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_document_items ALTER COLUMN unit_price TYPE NUMERIC(18, 2)"))
        logger.debug("[MigrateItemUnitPriceDecimal] project_document_items.unit_price -> NUMERIC(18,2)")
    print("마이그레이션 완료: project_document_items.unit_price NUMERIC(18,2)")


if __name__ == "__main__":
    main()
