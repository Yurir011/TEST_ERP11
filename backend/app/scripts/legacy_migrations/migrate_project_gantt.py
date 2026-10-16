"""대시보드의 프로젝트 진행 현황(간트차트)을 위한 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_gantt

동작:
  - projects.start_date / end_date (DATE, NULL 허용) 컬럼 추가
  - projects.progress_percent (INTEGER, 기본값 0) 컬럼 추가
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectGantt")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("projects")}

    with engine.begin() as conn:
        if "start_date" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN start_date DATE"))
            logger.debug("[MigrateProjectGantt] projects.start_date 컬럼 추가")

        if "end_date" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN end_date DATE"))
            logger.debug("[MigrateProjectGantt] projects.end_date 컬럼 추가")

        if "progress_percent" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0"))
            logger.debug("[MigrateProjectGantt] projects.progress_percent 컬럼 추가")

    print("마이그레이션 완료: 프로젝트 시작일/종료일/진행율 컬럼 추가")


if __name__ == "__main__":
    main()
