"""
client_contacts 테이블의 담당자 연락처를 유선전화/휴대폰 두 개로 분리하는 1회성 마이그레이션 스크립트.
기존 phone 컬럼(휴대폰으로 사용하던 값)은 데이터 보존을 위해 mobile_phone으로 이름만 바꾸고,
새로 landline_phone 컬럼을 추가한다.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블 구조를 바꾸려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_client_contact_phones
"""
from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateClientContactPhones")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("client_contacts")}

    with engine.begin() as conn:
        if "phone" in columns and "mobile_phone" not in columns:
            conn.execute(text("ALTER TABLE client_contacts RENAME COLUMN phone TO mobile_phone"))
            logger.debug("[MigrateClientContactPhones] phone -> mobile_phone 컬럼명 변경")

        if "landline_phone" not in columns:
            conn.execute(text("ALTER TABLE client_contacts ADD COLUMN landline_phone VARCHAR(50)"))
            logger.debug("[MigrateClientContactPhones] landline_phone 컬럼 추가")

    print("마이그레이션 완료: client_contacts.mobile_phone / landline_phone 컬럼 반영")


if __name__ == "__main__":
    main()
