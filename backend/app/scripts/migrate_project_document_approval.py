"""
project_documents 테이블을 완전한 결재(승인) 워크플로우로 확장하는 1회성 마이그레이션 스크립트.
견적서/거래명세서/세금계산서 작성 후 "저장"이 아니라 "결재요청"(소장/과장/전결 지정) -> 결재권자 승인/반려 ->
승인 시에만 PDF에 직인이 찍히고 저장/발송/출력이 가능하도록 하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블/enum을 변경하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_project_document_approval

동작:
  - projectdocumentstatus enum에 'pending'/'rejected' 값 추가 (없는 경우)
  - approvalroute enum 타입 생성 (없는 경우)
  - project_documents.approval_route / approver_id / reviewed_at / reject_reason 컬럼 추가 (없는 경우)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateProjectDocumentApproval")


def _enum_type_exists(conn, type_name: str) -> bool:
    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": type_name})
    return result.first() is not None


def _enum_value_exists(conn, type_name: str, value: str) -> bool:
    result = conn.execute(
        text(
            "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
            "WHERE t.typname = :type_name AND e.enumlabel = :value"
        ),
        {"type_name": type_name, "value": value},
    )
    return result.first() is not None


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("project_documents")}

    with engine.begin() as conn:
        for value in ("pending", "rejected"):
            if not _enum_value_exists(conn, "projectdocumentstatus", value):
                conn.execute(text(f"ALTER TYPE projectdocumentstatus ADD VALUE '{value}'"))
                logger.debug(f"[MigrateProjectDocumentApproval] projectdocumentstatus에 '{value}' 값 추가")

    with engine.begin() as conn:
        if not _enum_type_exists(conn, "approvalroute"):
            conn.execute(text("CREATE TYPE approvalroute AS ENUM ('chief', 'manager', 'self_decision')"))
            logger.debug("[MigrateProjectDocumentApproval] approvalroute enum 타입 생성")

        if "approval_route" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN approval_route approvalroute"))
            logger.debug("[MigrateProjectDocumentApproval] approval_route 컬럼 추가")

        if "approver_id" not in columns:
            conn.execute(
                text("ALTER TABLE project_documents ADD COLUMN approver_id INTEGER REFERENCES users(id)")
            )
            logger.debug("[MigrateProjectDocumentApproval] approver_id 컬럼 추가")

        if "reviewed_at" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN reviewed_at TIMESTAMPTZ"))
            logger.debug("[MigrateProjectDocumentApproval] reviewed_at 컬럼 추가")

        if "reject_reason" not in columns:
            conn.execute(text("ALTER TABLE project_documents ADD COLUMN reject_reason TEXT"))
            logger.debug("[MigrateProjectDocumentApproval] reject_reason 컬럼 추가")

    print("마이그레이션 완료: project_documents 결재 워크플로우 컬럼 반영")


if __name__ == "__main__":
    main()
