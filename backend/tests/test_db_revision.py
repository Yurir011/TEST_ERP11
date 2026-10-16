"""서버 시작 시 DB 리비전 확인(core/db_revision.py) 테스트."""
import logging

import pytest

from app.config import Settings
from app.core import db_revision
from app.database import engine

logger = logging.getLogger("test-db-revision")


def settings_for(env: str) -> Settings:
    return Settings(_env_file=None, environment=env, jwt_secret_key="x" * 48)


def test_test_db_is_up_to_date_and_check_passes():
    assert db_revision.current_revision(engine) == db_revision.head_revision()
    db_revision.check_db_revision(engine, settings_for("production"), logger)  # 예외 없음


def test_outdated_db_blocks_production_start(monkeypatch):
    monkeypatch.setattr(db_revision, "head_revision", lambda: "9999_future")
    with pytest.raises(RuntimeError) as exc:
        db_revision.check_db_revision(engine, settings_for("production"), logger)
    assert "alembic upgrade head" in str(exc.value)


def test_outdated_db_only_warns_in_development(monkeypatch, caplog):
    monkeypatch.setattr(db_revision, "head_revision", lambda: "9999_future")
    with caplog.at_level(logging.WARNING, logger="test-db-revision"):
        db_revision.check_db_revision(engine, settings_for("development"), logger)
    assert any("최신이 아닙니다" in r.message for r in caplog.records)
