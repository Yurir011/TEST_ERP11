"""
project_documents 테이블에 status 컬럼(draft/approved)을 추가하는 1회성 마이그레이션 스크립트.
견적서/거래명세서 작성 단계(draft)에는 직인을 찍지 않고, 결재 승인(approved) 시에만 엑셀에 직인이 찍히도록
하기 위함이다. 이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면
이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_document_status

동작:
  - projectdocumentstatus enum 타입 생성 (없는 경우)
  - project_documents.status 컬럼 추가 (없는 경우, 기존 문서는 모두 'draft'로 채움)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectDocumentStatus")


def _enum_type_exists(conn, type_name: str) -> bool:
    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": type_name})
    return result.first() is not None


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("project_documents")}

    with engine.begin() as conn:
        if not _enum_type_exists(conn, "projectdocumentstatus"):
            conn.execute(text("CREATE TYPE projectdocumentstatus AS ENUM ('draft', 'approved')"))
            logger.debug("[MigrateProjectDocumentStatus] projectdocumentstatus enum 타입 생성")

        if "status" not in columns:
            conn.execute(
                text("ALTER TABLE project_documents ADD COLUMN status projectdocumentstatus NOT NULL DEFAULT 'draft'")
            )
            logger.debug("[MigrateProjectDocumentStatus] status 컬럼 추가 (기존 문서는 draft로 설정)")

    print("마이그레이션 완료: project_documents.status 컬럼 반영")


if __name__ == "__main__":
    main()
