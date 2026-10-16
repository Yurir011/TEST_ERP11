"""
todo_items 테이블에 color 컬럼을 추가하는 1회성 마이그레이션 스크립트. (메모별 글씨 색 저장용)
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.migrate_todo_color
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateTodoColor")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("todo_items")}
    with engine.begin() as conn:
        if "color" not in columns:
            conn.execute(text("ALTER TABLE todo_items ADD COLUMN color VARCHAR(9)"))
            logger.debug("[MigrateTodoColor] color 컬럼 추가")
    print("마이그레이션 완료: todo_items.color 컬럼 반영")


if __name__ == "__main__":
    main()
