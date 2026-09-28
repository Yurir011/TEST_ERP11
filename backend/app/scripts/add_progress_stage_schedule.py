"""
project_progress_stages 테이블에 주차 기반 진행 타임라인 표시용 start_date, end_date 컬럼을 추가하는
1회성 마이그레이션 스크립트. 항목마다 시작일이 다르고, 다른 항목과 기간이 겹칠 수 있는 진행 타임라인을
표현하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블 구조를 바꾸려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.add_progress_stage_schedule

동작:
  - project_progress_stages.start_date 컬럼 추가 (없는 경우, DATE, NULL 허용)
  - project_progress_stages.end_date 컬럼 추가 (없는 경우, DATE, NULL 허용)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddProgressStageSchedule")

TABLE = "project_progress_stages"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "start_date" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN start_date DATE"))
            logger.debug(f"[AddProgressStageSchedule] {TABLE}.start_date 컬럼 추가")

        if "end_date" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN end_date DATE"))
            logger.debug(f"[AddProgressStageSchedule] {TABLE}.end_date 컬럼 추가")

    print(f"마이그레이션 완료: {TABLE}.start_date / end_date 컬럼 반영")


if __name__ == "__main__":
    main()
