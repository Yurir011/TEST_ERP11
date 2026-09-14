"""
users 테이블을 부서(department) 자유입력 방식에서 직급(grade)/직책(title) 체계로 전환하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가/삭제하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_grade_title

동작:
  - jobgrade / jobtitle enum 타입 생성 (없는 경우)
  - users.grade, users.title 컬럼 추가 (없는 경우)
  - 기존 관리자(role=admin) 계정은 직책을 '대표'로 채워 권한이 유지되도록 함
  - users.department 컬럼 삭제 (있는 경우)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateGradeTitle")


def _enum_type_exists(conn, type_name: str) -> bool:
    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": type_name})
    return result.first() is not None


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.begin() as conn:
        if not _enum_type_exists(conn, "jobgrade"):
            conn.execute(text(
                "CREATE TYPE jobgrade AS ENUM ('staff', 'assistant_manager', 'manager', 'director', 'chief')"
            ))
            logger.debug("[MigrateGradeTitle] jobgrade enum 타입 생성")

        if not _enum_type_exists(conn, "jobtitle"):
            conn.execute(text("CREATE TYPE jobtitle AS ENUM ('ceo', 'team_lead')"))
            logger.debug("[MigrateGradeTitle] jobtitle enum 타입 생성")

        if "grade" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN grade jobgrade NOT NULL DEFAULT 'staff'"))
            logger.debug("[MigrateGradeTitle] grade 컬럼 추가")

        if "title" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN title jobtitle"))
            logger.debug("[MigrateGradeTitle] title 컬럼 추가")

        conn.execute(text("UPDATE users SET title = 'ceo' WHERE role = 'admin' AND title IS NULL"))
        logger.debug("[MigrateGradeTitle] 기존 관리자 계정 직책을 '대표'로 설정")

        if "department" in columns:
            conn.execute(text("ALTER TABLE users DROP COLUMN department"))
            logger.debug("[MigrateGradeTitle] department 컬럼 제거")

    print("마이그레이션 완료: grade/title 컬럼 반영, department 컬럼 제거")


if __name__ == "__main__":
    main()
