"""
품의서 삭제 결재용 1회성 마이그레이션 스크립트.
- proposals.delete_requested (삭제 결재 진행 여부), proposals.delete_prev_steps (삭제 요청 전 결재선 보관) 컬럼을 추가한다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로 기존 DB에는 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.add_proposal_delete_request
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddProposalDeleteRequest")


def main():
    columns = {col["name"] for col in inspect(engine).get_columns("proposals")}
    with engine.begin() as conn:
        if "delete_requested" not in columns:
            conn.execute(text("ALTER TABLE proposals ADD COLUMN delete_requested BOOLEAN NOT NULL DEFAULT FALSE"))
            logger.debug("[AddProposalDeleteRequest] delete_requested 컬럼 추가")
        if "delete_prev_steps" not in columns:
            conn.execute(text("ALTER TABLE proposals ADD COLUMN delete_prev_steps JSON"))
            logger.debug("[AddProposalDeleteRequest] delete_prev_steps 컬럼 추가")
    print("마이그레이션 완료: proposals.delete_requested / delete_prev_steps 컬럼 반영")


if __name__ == "__main__":
    main()
