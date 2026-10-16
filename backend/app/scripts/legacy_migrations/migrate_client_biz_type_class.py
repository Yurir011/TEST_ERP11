"""
clients 테이블의 business_type(업종/업태 결합 문자열)을 biz_type(업태)/biz_class(종목) 두 컬럼으로
분리하는 1회성 마이그레이션 스크립트. 세금계산서(팝빌) 발행 시 업태/종목을 각각 전달하기 위함이다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블 구조를 바꾸려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_client_biz_type_class

동작:
  - clients.biz_type / clients.biz_class 컬럼 추가 (없는 경우, VARCHAR(200), nullable)
  - 기존 business_type 값이 "업태 / 종목" 형식(OCR 인식 시 저장되던 형식)이면 분리해서 옮기고,
    그 형식이 아니면 전체 값을 biz_type에 넣는다 (종목은 비워두고 사용자가 직접 채우도록 함)
  - business_type 컬럼 삭제
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateClientBizTypeClass")

TABLE = "clients"


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns(TABLE)}

    with engine.begin() as conn:
        if "biz_type" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN biz_type VARCHAR(200)"))
            logger.debug(f"[MigrateClientBizTypeClass] {TABLE}.biz_type 컬럼 추가")
        if "biz_class" not in columns:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN biz_class VARCHAR(200)"))
            logger.debug(f"[MigrateClientBizTypeClass] {TABLE}.biz_class 컬럼 추가")

        if "business_type" in columns:
            rows = conn.execute(text(f"SELECT id, business_type FROM {TABLE} WHERE business_type IS NOT NULL")).fetchall()
            for row in rows:
                value = row.business_type or ""
                if " / " in value:
                    biz_type, biz_class = value.split(" / ", 1)
                else:
                    biz_type, biz_class = value, None
                conn.execute(
                    text(f"UPDATE {TABLE} SET biz_type = :biz_type, biz_class = :biz_class WHERE id = :id"),
                    {"biz_type": biz_type.strip() or None, "biz_class": (biz_class or "").strip() or None, "id": row.id},
                )
            logger.debug(f"[MigrateClientBizTypeClass] business_type 값 {len(rows)}건 이관")
            conn.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN business_type"))
            logger.debug(f"[MigrateClientBizTypeClass] {TABLE}.business_type 컬럼 제거")

    print(f"마이그레이션 완료: {TABLE}.biz_type/biz_class 컬럼 반영")


if __name__ == "__main__":
    main()
