"""서버 시작 시 DB 구조(Alembic 리비전)가 최신인지 확인한다.

서버는 시작할 때 DB 구조를 스스로 바꾸지 않는다. 구조 변경은 사람이 백업한 뒤
`venv\\Scripts\\python.exe -m alembic upgrade head` 로 실행한다 (start.bat 가 시작 전에 실행한다).
최신이 아니면 운영 환경(ENVIRONMENT=production)에서는 시작을 막고, 개발 환경에서는 경고만 남긴다.
"""
import logging
from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Engine

from app.config import Settings

ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


def head_revision() -> str | None:
    return ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def check_db_revision(engine: Engine, s: Settings, logger: logging.Logger) -> None:
    head = head_revision()
    current = current_revision(engine)
    if current == head:
        logger.debug(f"[Startup] DB 구조 최신: revision={current}")
        return
    message = (
        f"DB 구조가 최신이 아닙니다 (현재 {current or '기록 없음'}, 최신 {head}). "
        "DB 를 백업한 뒤 backend 폴더에서 'venv\\Scripts\\python.exe -m alembic upgrade head' 를 실행하세요."
    )
    if s.environment.lower() == "production":
        logger.error(f"[Startup] {message}")
        raise RuntimeError(message)
    logger.warning(f"[Startup] {message} (개발 환경이라 계속 진행)")
