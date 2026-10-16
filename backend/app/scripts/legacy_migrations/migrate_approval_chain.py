"""모든 결재(연차/증빙서류/문서관리)를 "어느 단계(부서장/팀장/대표)에서 마무리할지"를 먼저 정하고
단계별 결재자를 고르는 다단계 결재선 방식으로 바꾸는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가/신규 테이블을 만들려면
이 스크립트를 수동 실행해야 한다. (품의서는 기존 proposal_approval_steps 테이블을 그대로 쓰므로 대상이 아니다.)

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_approval_chain

동작:
  - approval_steps 테이블 생성 (Base.metadata.create_all로 생성됨 - 여기서는 존재만 확인)
  - leave_requests / document_issues / project_documents 에 current_step 컬럼 추가 (기본값 1)
  - 기존에 이미 승인/반려/대기 중이던 행은 approver_id가 가리키는 결재자 직책을 그대로 1단계 결재선으로
    옮겨 적어서(approval_steps에 1건씩 생성), 과거 이력의 결재선 화면이 비어 보이지 않게 한다.
"""
from sqlalchemy import inspect, text

from app.database import Base, SessionLocal, engine
from app.logging_config import get_logger, setup_logging
from app.models import approval_step  # noqa: F401 (create_all 대상에 포함시키기 위한 임포트)
from app.models.approval_step import ApprovalStep, ApprovalStepStatus, ApprovalTargetType
from app.models.document import DocumentIssue
from app.models.leave import LeaveRequest
from app.models.project_document import ProjectDocument, ProjectDocumentStatus
from app.models.user import User

setup_logging()
logger = get_logger("MigrateApprovalChain")

_STATUS_MAP = {
    "pending": ApprovalStepStatus.pending,
    "approved": ApprovalStepStatus.approved,
    "rejected": ApprovalStepStatus.rejected,
}


def _add_current_step_column(conn, table: str) -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(table)}
    if "current_step" not in columns:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN current_step INTEGER NOT NULL DEFAULT 1"))
        logger.debug(f"[MigrateApprovalChain] {table}.current_step 컬럼 추가")


def _backfill_single_step(db, target_type: ApprovalTargetType, record, status_value: str, approver_id: int | None) -> None:
    if approver_id is None:
        return
    existing = (
        db.query(ApprovalStep)
        .filter(ApprovalStep.target_type == target_type, ApprovalStep.target_id == record.id)
        .first()
    )
    if existing:
        return
    approver = db.query(User).filter(User.id == approver_id).first()
    title = approver.title if approver and approver.title else None
    if title is None:
        return  # 직책 정보가 없는 결재자(과거 데이터 이상치)는 건너뛴다.

    step = ApprovalStep(
        target_type=target_type,
        target_id=record.id,
        step_order=1,
        title=title,
        approver_id=approver_id,
        status=_STATUS_MAP.get(status_value, ApprovalStepStatus.pending),
        decided_at=getattr(record, "reviewed_at", None),
    )
    db.add(step)


def main():
    Base.metadata.create_all(bind=engine)  # approval_steps 테이블 생성

    with engine.begin() as conn:
        _add_current_step_column(conn, "leave_requests")
        _add_current_step_column(conn, "document_issues")
        _add_current_step_column(conn, "project_documents")

    db = SessionLocal()
    try:
        leaves = db.query(LeaveRequest).all()
        for r in leaves:
            _backfill_single_step(db, ApprovalTargetType.leave, r, r.status.value, r.approver_id)
        logger.debug(f"[MigrateApprovalChain] 연차 결재선 백필 대상: {len(leaves)}건")

        documents = db.query(DocumentIssue).all()
        for r in documents:
            _backfill_single_step(db, ApprovalTargetType.document, r, r.status.value, r.approver_id)
        logger.debug(f"[MigrateApprovalChain] 증빙서류 결재선 백필 대상: {len(documents)}건")

        project_documents = db.query(ProjectDocument).filter(ProjectDocument.status != ProjectDocumentStatus.draft).all()
        for r in project_documents:
            _backfill_single_step(db, ApprovalTargetType.project_document, r, r.status.value, r.approver_id)
        logger.debug(f"[MigrateApprovalChain] 문서관리 결재선 백필 대상: {len(project_documents)}건")

        db.commit()
    finally:
        db.close()

    print("마이그레이션 완료: 다단계 결재선(approval_steps) 반영")


if __name__ == "__main__":
    main()
