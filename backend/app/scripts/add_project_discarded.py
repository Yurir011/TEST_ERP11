"""
프로젝트 "폐기" 상태 추가용 1회성 마이그레이션 스크립트.
- projects.status의 Postgres enum 타입(projectstatus)에 'discarded' 값을 추가한다.
- projects.discard_reason(폐기 사유) 컬럼을 추가한다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로 기존 DB에는 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.add_project_discarded
"""
from sqlalchemy import text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddProjectDiscarded")


def main():
    # ALTER TYPE ... ADD VALUE는 같은 트랜잭션에서 새 값을 쓸 수 없으므로 컬럼 추가와 분리해 각자 커밋한다.
    with engine.begin() as conn:
        conn.execute(text("ALTER TYPE projectstatus ADD VALUE IF NOT EXISTS 'discarded'"))
        logger.debug("[AddProjectDiscarded] projectstatus enum에 discarded 값 추가")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS discard_reason TEXT"))
        logger.debug("[AddProjectDiscarded] projects.discard_reason 컬럼 추가")
    print("마이그레이션 완료: projectstatus에 discarded 추가, projects.discard_reason 컬럼 추가")


if __name__ == "__main__":
    main()
