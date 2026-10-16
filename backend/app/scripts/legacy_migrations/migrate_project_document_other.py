"""
project_documents 테이블에 "기타" 프로젝트 지원 컬럼을 추가하는 1회성 마이그레이션 스크립트.
  - project_id를 NULL 허용으로 변경 ("기타"를 고른 문서는 프로젝트 없이 저장)
  - project_other_name 추가 ("기타" 선택 시 직접 입력한 내용)
  - other_client_id 추가 ("기타" 문서에서 거래처명으로 찾은 거래처 연결)

사용법: backend 폴더에서
  venv\Scripts\python.exe -m app.scripts.migrate_project_document_other
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectDocumentOther")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("project_documents")}
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_documents ALTER COLUMN project_id DROP NOT NULL"))
        logger.debug("[MigrateProjectDocumentOther] project_id NULL 허용")
        if "project_other_name" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN project_other_name VARCHAR(200)"))
            logger.debug("[MigrateProjectDocumentOther] project_other_name 컬럼 추가")
        if "other_client_id" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN other_client_id INTEGER REFERENCES clients(id)"))
            logger.debug("[MigrateProjectDocumentOther] other_client_id 컬럼 추가")
    print("마이그레이션 완료: project_documents 기타 프로젝트 컬럼 반영")


if __name__ == "__main__":
    main()
