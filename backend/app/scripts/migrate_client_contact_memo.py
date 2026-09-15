"""
client_contacts 테이블에 담당자별 메모(memo) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_client_contact_memo
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateClientContactMemo")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("client_contacts")}

    with engine.begin() as conn:
        if "memo" not in columns:
            conn.execute(text("ALTER TABLE client_contacts ADD COLUMN memo TEXT"))
            logger.debug("[MigrateClientContactMemo] memo 컬럼 추가")

    print("마이그레이션 완료: client_contacts.memo 컬럼 반영")


if __name__ == "__main__":
    main()
