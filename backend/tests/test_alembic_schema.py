"""DB 마이그레이션(Alembic) 일치 검사.

모델을 바꾸고 리비전을 만들지 않으면 이 테스트가 실패한다. 실패하면:
  venv\Scripts\python.exe -m alembic revision --autogenerate -m "설명"  → 생성된 파일을 확인하고 함께 커밋
"""
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.database import Base, engine


def test_models_match_latest_revision():
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True, "compare_server_default": True})
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == [], f"모델과 DB 리비전이 다릅니다. 새 리비전이 필요합니다: {diff}"


def test_test_db_is_at_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from tests.conftest import BACKEND_DIR

    head = ScriptDirectory.from_config(Config(str(BACKEND_DIR / "alembic.ini"))).get_current_head()
    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()
    assert current == head
