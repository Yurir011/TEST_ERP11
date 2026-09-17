"""
project_purchase_steps 테이블에 custom_label 컬럼을 추가하는 1회성 마이그레이션 스크립트.
구매 진행 단계(요청/승인/구매/지급/입고·전달) 이름을 프로젝트별로 직접 수정할 수 있게 하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_purchase_step_custom_label

동작:
  - project_purchase_steps.custom_label 컬럼 추가 (없는 경우, VARCHAR(50), nullable)
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigratePurchaseStepCustomLabel")


def main():
    inspector = inspect(engine)
    if not inspector.has_table("project_purchase_steps"):
        print("project_purchase_steps 테이블이 아직 없습니다. 서버를 한 번 실행해 create_all이 테이블을 만들게 한 뒤 다시 실행해주세요.")
        return

    columns = {col["name"] for col in inspector.get_columns("project_purchase_steps")}

    with engine.begin() as conn:
        if "custom_label" not in columns:
            conn.execute(text("ALTER TABLE project_purchase_steps ADD COLUMN custom_label VARCHAR(50)"))
            logger.debug("[MigratePurchaseStepCustomLabel] custom_label 컬럼 추가")

    print("마이그레이션 완료: project_purchase_steps.custom_label 컬럼 반영")


if __name__ == "__main__":
    main()
