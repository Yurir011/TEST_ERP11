"""
project_progress_stages 테이블을 완료 체크(is_done) 방식에서 10% 단위 진행률(progress_percent) 방식으로
전환하는 1회성 마이그레이션 스크립트. 진행상황 항목을 완료/미완료 뿐 아니라 0~100% 사이 10 단위로
직접 체크할 수 있도록 하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블 구조를 바꾸려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_progress_stage_percent

동작:
  - project_progress_stages.progress_percent 컬럼 추가 (없는 경우, INTEGER, 기본값 0)
  - 기존 is_done 컬럼이 남아있으면 값을 이관 (True -> 100, False -> 0) 후 컬럼 삭제
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProgressStagePercent")

TABLE = "project_progress_stages"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "progress_percent" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0"))
            logger.debug(f"[MigrateProgressStagePercent] {TABLE}.progress_percent 컬럼 추가")

        if "is_done" in columns:
            conn.execute(
                text(f"UPDATE {TABLE} SET progress_percent = CASE WHEN is_done THEN 100 ELSE 0 END")
            )
            logger.debug(f"[MigrateProgressStagePercent] is_done 값을 progress_percent로 이관")
            conn.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN is_done"))
            logger.debug(f"[MigrateProgressStagePercent] {TABLE}.is_done 컬럼 제거")

    print(f"마이그레이션 완료: {TABLE}.progress_percent 컬럼 반영")


if __name__ == "__main__":
    main()
