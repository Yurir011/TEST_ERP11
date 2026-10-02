"""모든 결재(연차/증빙서류/문서관리/품의서)에 전결(is_final_decision) 컬럼을 추가하는 1회성 마이그레이션 스크립트.
전결은 결재선 선택 없이 신청자 본인 결재로 즉시 승인을 완료하는 기능이다 (전 직원 사용 가능).
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_final_decision

동작:
  - leave_requests / document_issues / project_documents / proposals 테이블에
    is_final_decision 컬럼 추가 (없는 경우, BOOLEAN NOT NULL DEFAULT false)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateFinalDecision")

TARGET_TABLES = ("leave_requests", "document_issues", "project_documents", "proposals")


def main():
    inspector = inspect(engine)

    with engine.begin() as conn:
        for table in TARGET_TABLES:
            columns = {col["name"] for col in inspector.get_columns(table)}
            if "is_final_decision" not in columns:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN is_final_decision BOOLEAN NOT NULL DEFAULT false")
                )
                logger.debug(f"[MigrateFinalDecision] {table}.is_final_decision 컬럼 추가")

    print("마이그레이션 완료: 연차/증빙서류/문서관리/품의서 전결 컬럼 반영")


if __name__ == "__main__":
    main()
