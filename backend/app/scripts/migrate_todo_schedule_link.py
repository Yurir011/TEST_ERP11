"""
todo_items 테이블에 schedule_event_id 컬럼을 추가하는 1회성 마이그레이션 스크립트.
"오늘의 할일"에 항목을 추가하면 일정관리 캘린더에도 같은 날짜로 자동 기록되도록 연결하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_todo_schedule_link

동작:
  - todo_items.schedule_event_id 컬럼 추가 (없는 경우, schedule_events.id를 참조하는 FK, ON DELETE SET NULL)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTodoScheduleLink")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("todo_items")}

    with engine.begin() as conn:
        if "schedule_event_id" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE todo_items ADD COLUMN schedule_event_id INTEGER "
                    "REFERENCES schedule_events(id) ON DELETE SET NULL"
                )
            )
            logger.debug("[MigrateTodoScheduleLink] schedule_event_id 컬럼 추가")

    print("마이그레이션 완료: todo_items.schedule_event_id 컬럼 반영")


if __name__ == "__main__":
    main()
