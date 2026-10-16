"""
거래처 담당자를 clients 테이블의 단일 컬럼(contact_name/contact_phone/contact_email)에서
1:N 관계인 client_contacts 테이블로 전환하는 1회성 마이그레이션 스크립트.
이 프로젝트는 Alembic 없이 create_all만 사용하므로, 기존 테이블 구조를 바꾸려면 이 스크립트를 수동 실행해야 한다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_client_contacts

동작:
  - client_contacts 테이블 생성 (없는 경우)
  - clients.contact_name/contact_phone/contact_email 값이 있는 기존 거래처는
    client_contacts에 담당자 1건으로 이전 (title은 비워둠)
  - clients.contact_name/contact_phone/contact_email 컬럼 삭제
"""
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.logging_config import get_logger, setup_logging
from app.models.client import ClientContact  # noqa: F401 (Base.metadata에 테이블 등록 목적)

setup_logging()
logger = get_logger("MigrateClientContacts")


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("clients")}
    has_old_contact_columns = {"contact_name", "contact_phone", "contact_email"} & columns

    if "client_contacts" not in inspector.get_table_names():
        Base.metadata.create_all(bind=engine, tables=[ClientContact.__table__])
        logger.debug("[MigrateClientContacts] client_contacts 테이블 생성")

    with engine.begin() as conn:
        if has_old_contact_columns:
            rows = conn.execute(
                text(
                    "SELECT id, contact_name, contact_phone, contact_email FROM clients "
                    "WHERE contact_name IS NOT NULL OR contact_phone IS NOT NULL OR contact_email IS NOT NULL"
                )
            ).fetchall()
            for row in rows:
                conn.execute(
                    text(
                        "INSERT INTO client_contacts (client_id, name, title, phone, email, sort_order) "
                        "VALUES (:client_id, :name, NULL, :phone, :email, 0)"
                    ),
                    {
                        "client_id": row.id,
                        "name": row.contact_name or "담당자",
                        "phone": row.contact_phone,
                        "email": row.contact_email,
                    },
                )
            logger.debug(f"[MigrateClientContacts] 기존 담당자 {len(rows)}건 이전")

            for col in ("contact_name", "contact_phone", "contact_email"):
                if col in columns:
                    conn.execute(text(f"ALTER TABLE clients DROP COLUMN {col}"))
            logger.debug("[MigrateClientContacts] clients.contact_name/contact_phone/contact_email 컬럼 제거")

    print("마이그레이션 완료: client_contacts 테이블 반영, 기존 담당자 데이터 이전")


if __name__ == "__main__":
    main()
