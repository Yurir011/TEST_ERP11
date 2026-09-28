"""
clients 테이블에 사업자등록증 첨부파일 경로 컬럼(biz_reg_image_path)을 추가하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블에 컬럼을 추가하려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.add_client_biz_reg_image
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddClientBizRegImage")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("clients")}

    with engine.begin() as conn:
        if "biz_reg_image_path" not in columns:
            conn.execute(text("ALTER TABLE clients ADD COLUMN biz_reg_image_path VARCHAR(500)"))
            logger.debug("[AddClientBizRegImage] clients.biz_reg_image_path 컬럼 추가")

    print("마이그레이션 완료: clients.biz_reg_image_path 컬럼 반영")


if __name__ == "__main__":
    main()
