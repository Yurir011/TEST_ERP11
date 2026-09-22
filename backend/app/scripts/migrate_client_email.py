"""
clients 테이블에 email 컬럼을 추가하는 1회성 마이그레이션 스크립트.
거래처 자체의 대표 이메일(담당자별 이메일과 별개)을 등록할 수 있도록 하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_client_email

동작:
  - clients.email 컬럼 추가 (없는 경우, VARCHAR(255), nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateClientEmail")

TABLE = "clients"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "email" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN email VARCHAR(255)"))
            logger.debug(f"[MigrateClientEmail] {TABLE}.email 컬럼 추가")

    print(f"마이그레이션 완료: {TABLE}.email 컬럼 반영")


if __name__ == "__main__":
    main()
