"""결재권자를 팀장/대표(직책) 기반 단일 콤보박스로 통일하면서, 연차신청과 재직증명서/경력증명서에도
견적서/거래명세서/세금계산서와 동일한 결재(승인/반려) 워크플로우를 도입하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블/enum을 변경하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_unified_approval

동작:
  - leave_requests.approver_id / reject_reason 컬럼 추가, 기존 행은 대표(admin) 계정으로 백필
  - documentstatus enum 생성, document_issues.status/approver_id/reviewed_at/reject_reason 컬럼 추가,
    file_path NOT NULL 해제, 기존 행은 status='approved'로 백필(이미 발급된 PDF가 있으므로)
  - project_documents.excel_path 컬럼 추가, approval_route 컬럼 및 approvalroute enum 타입 제거
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateUnifiedApproval")


def _enum_type_exists(conn, type_name: str) -> bool:
    result = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": type_name})
    return result.first() is not None


def _first_admin_id(conn) -> int | None:
    result = conn.execute(text("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"))
    row = result.first()
    return row[0] if row else None


def _migrate_leave_requests(inspector, conn) -> None:
    columns = {col["name"] for col in inspector.get_columns("leave_requests")}
    admin_id = _first_admin_id(conn)

    if "approver_id" not in columns:
        conn.execute(text("ALTER TABLE leave_requests ADD COLUMN approver_id INTEGER REFERENCES users(id)"))
        logger.debug("[MigrateUnifiedApproval] leave_requests.approver_id 컬럼 추가")
        if admin_id is not None:
            conn.execute(
                text("UPDATE leave_requests SET approver_id = :admin_id WHERE approver_id IS NULL"),
                {"admin_id": admin_id},
            )
            logger.debug(f"[MigrateUnifiedApproval] leave_requests 기존 행 approver_id 백필: admin_id={admin_id}")

    if "reject_reason" not in columns:
        conn.execute(text("ALTER TABLE leave_requests ADD COLUMN reject_reason VARCHAR(500)"))
        logger.debug("[MigrateUnifiedApproval] leave_requests.reject_reason 컬럼 추가")


def _migrate_document_issues(inspector, conn) -> None:
    columns = {col["name"] for col in inspector.get_columns("document_issues")}
    admin_id = _first_admin_id(conn)

    if not _enum_type_exists(conn, "documentstatus"):
        conn.execute(text("CREATE TYPE documentstatus AS ENUM ('pending', 'approved', 'rejected')"))
        logger.debug("[MigrateUnifiedApproval] documentstatus enum 타입 생성")

    if "status" not in columns:
        conn.execute(text("ALTER TABLE document_issues ADD COLUMN status documentstatus"))
        conn.execute(text("UPDATE document_issues SET status = 'approved' WHERE status IS NULL"))
        conn.execute(text("ALTER TABLE document_issues ALTER COLUMN status SET DEFAULT 'pending'"))
        logger.debug("[MigrateUnifiedApproval] document_issues.status 컬럼 추가 (기존 행은 'approved'로 백필)")

    if "approver_id" not in columns:
        conn.execute(text("ALTER TABLE document_issues ADD COLUMN approver_id INTEGER REFERENCES users(id)"))
        if admin_id is not None:
            conn.execute(
                text("UPDATE document_issues SET approver_id = :admin_id WHERE approver_id IS NULL"),
                {"admin_id": admin_id},
            )
        logger.debug(f"[MigrateUnifiedApproval] document_issues.approver_id 컬럼 추가 및 백필: admin_id={admin_id}")

    if "reviewed_at" not in columns:
        conn.execute(text("ALTER TABLE document_issues ADD COLUMN reviewed_at TIMESTAMPTZ"))
        conn.execute(text("UPDATE document_issues SET reviewed_at = issued_at WHERE reviewed_at IS NULL"))
        logger.debug("[MigrateUnifiedApproval] document_issues.reviewed_at 컬럼 추가 (기존 행은 issued_at으로 백필)")

    if "reject_reason" not in columns:
        conn.execute(text("ALTER TABLE document_issues ADD COLUMN reject_reason VARCHAR(500)"))
        logger.debug("[MigrateUnifiedApproval] document_issues.reject_reason 컬럼 추가")

    conn.execute(text("ALTER TABLE document_issues ALTER COLUMN file_path DROP NOT NULL"))
    logger.debug("[MigrateUnifiedApproval] document_issues.file_path NOT NULL 제약 해제")


def _migrate_project_documents(inspector, conn) -> None:
    columns = {col["name"] for col in inspector.get_columns("project_documents")}

    if "excel_path" not in columns:
        conn.execute(text("ALTER TABLE project_documents ADD COLUMN excel_path VARCHAR(500)"))
        logger.debug("[MigrateUnifiedApproval] project_documents.excel_path 컬럼 추가")

    if "approval_route" in columns:
        conn.execute(text("ALTER TABLE project_documents DROP COLUMN approval_route"))
        logger.debug("[MigrateUnifiedApproval] project_documents.approval_route 컬럼 제거")

    if _enum_type_exists(conn, "approvalroute"):
        conn.execute(text("DROP TYPE approvalroute"))
        logger.debug("[MigrateUnifiedApproval] approvalroute enum 타입 제거")


def main():
    inspector = inspect(engine)

    with engine.begin() as conn:
        _migrate_leave_requests(inspector, conn)

    with engine.begin() as conn:
        _migrate_document_issues(inspector, conn)

    with engine.begin() as conn:
        _migrate_project_documents(inspector, conn)

    print("마이그레이션 완료: 연차/증명서/문서관리 결재 워크플로우 통일 반영")


if __name__ == "__main__":
    main()
