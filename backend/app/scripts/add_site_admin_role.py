"""
users.role의 Postgres enum 타입(userrole)에 'site_admin' 값을 추가하는 1회성 마이그레이션 스크립트.
Python Enum(UserRole)에 site_admin을 추가한 것만으로는 기존 DB의 enum 타입이 갱신되지 않으므로 별도 실행이 필요하다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.add_site_admin_role
"""
from sqlalchemy import text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddSiteAdminRole")


def main():
    with engine.begin() as conn:
        conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'site_admin'"))
        logger.debug("[AddSiteAdminRole] userrole enum에 site_admin 값 추가")
    print("마이그레이션 완료: userrole enum에 site_admin 값 추가")


if __name__ == "__main__":
    main()
