"""
문서관리(견적서/거래명세서/세금계산서)를 다중 품목(최대 8개) 구조로 전환하는 1회성 마이그레이션 스크립트.
기존 project_documents는 문서 1건당 단일 내용/수량/단가/비고만 저장했는데, 이제 문서 1건이 여러 품목을
가질 수 있도록 project_document_items 자식 테이블로 분리하고, 엑셀 자동 생성 파일 경로(file_path)를 추가한다.
아직 실사용 데이터가 없는 초기 단계라 기존 project_documents 테이블을 삭제하고 새 구조로 재생성한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_documents_v2
"""
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.logging_config import get_logger, setup_logging
from app.models.project_document import ProjectDocument, ProjectDocumentItem  # noqa: F401

setup_logging()
logger = get_logger("MigrateProjectDocumentsV2")


def main():
    inspector = inspect(engine)
    with engine.begin() as conn:
        if "project_documents" in inspector.get_table_names():
            conn.execute(text("DROP TABLE IF EXISTS project_documents CASCADE"))
            logger.debug("[MigrateProjectDocumentsV2] 기존 project_documents 테이블 삭제")

    Base.metadata.create_all(bind=engine, tables=[ProjectDocument.__table__, ProjectDocumentItem.__table__])
    logger.debug("[MigrateProjectDocumentsV2] project_documents / project_document_items 테이블 재생성")
    print("마이그레이션 완료: project_documents(+file_path) / project_document_items 테이블 반영")


if __name__ == "__main__":
    main()
