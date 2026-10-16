"""
문서관리(견적서/거래명세서/세금계산서 간단 입력) 기능을 위한 project_documents 테이블을 생성하는 1회성 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 새 테이블도 이 스크립트로 명시적으로 생성한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_documents
"""
from sqlalchemy import inspect

from app.database import Base, engine
from app.logging_config import get_logger, setup_logging
from app.models.project_document import ProjectDocument  # noqa: F401 (Base.metadata에 테이블 등록 목적)

setup_logging()
logger = get_logger("MigrateProjectDocuments")


def main():
    inspector = inspect(engine)
    if "project_documents" not in inspector.get_table_names():
        Base.metadata.create_all(bind=engine, tables=[ProjectDocument.__table__])
        logger.debug("[MigrateProjectDocuments] project_documents 테이블 생성")
        print("마이그레이션 완료: project_documents 테이블 생성")
    else:
        print("이미 존재함: project_documents 테이블")


if __name__ == "__main__":
    main()
