"""schedule_events 테이블에 음력 일정 여부(is_lunar) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블을 변경하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_schedule_lunar
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateScheduleLunar")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("schedule_events")}

    with engine.begin() as conn:
        if "is_lunar" not in columns:
            conn.execute(text("ALTER TABLE schedule_events ADD COLUMN is_lunar BOOLEAN NOT NULL DEFAULT false"))
            logger.debug("[MigrateScheduleLunar] schedule_events.is_lunar 컬럼 추가")

    print("마이그레이션 완료: schedule_events.is_lunar 반영")


if __name__ == "__main__":
    main()
