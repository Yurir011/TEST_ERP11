"""
todo_items 테이블에 completed_on 컬럼을 추가하는 1회성 마이그레이션 스크립트.
"오늘의 할일"을 체크(완료 처리)하면 완료된 날짜를 기록해, 그 날짜가 지나면
목록 조회 시 자동으로 숨겨지도록(다음날 목록에서 사라지도록) 하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_todo_completed_on

동작:
  - todo_items.completed_on 컬럼 추가 (없는 경우, DATE, nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTodoCompletedOn")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("todo_items")}

    with engine.begin() as conn:
        if "completed_on" not in columns:
            conn.execute(text("ALTER TABLE todo_items ADD COLUMN completed_on DATE"))
            logger.debug("[MigrateTodoCompletedOn] completed_on 컬럼 추가")

    print("마이그레이션 완료: todo_items.completed_on 컬럼 반영")


if __name__ == "__main__":
    main()
