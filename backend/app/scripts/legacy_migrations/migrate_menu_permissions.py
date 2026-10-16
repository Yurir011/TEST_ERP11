"""
users 테이블에 menu_permissions(일반직원별 메뉴 열람 권한 체크리스트) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_menu_permissions

동작:
  - users.menu_permissions 컬럼 추가 (없는 경우, VARCHAR(50)[] NOT NULL DEFAULT '{}')
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateMenuPermissions")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.begin() as conn:
        if "menu_permissions" not in columns:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN menu_permissions VARCHAR(50)[] NOT NULL DEFAULT '{}'")
            )
            logger.debug("[MigrateMenuPermissions] menu_permissions 컬럼 추가")

    print("마이그레이션 완료: menu_permissions 컬럼 반영")


if __name__ == "__main__":
    main()
