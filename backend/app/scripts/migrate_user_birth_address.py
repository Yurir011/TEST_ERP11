"""
users 테이블에 생년월일(birth_date)/주소(address) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_user_birth_address

동작:
  - users.birth_date, users.address 컬럼 추가 (없는 경우)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateUserBirthAddress")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.begin() as conn:
        if "birth_date" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN birth_date DATE"))
            logger.debug("[MigrateUserBirthAddress] birth_date 컬럼 추가")

        if "address" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN address VARCHAR(300)"))
            logger.debug("[MigrateUserBirthAddress] address 컬럼 추가")

    print("마이그레이션 완료: users.birth_date / address 컬럼 반영")


if __name__ == "__main__":
    main()
