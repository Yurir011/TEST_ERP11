"""테스트 공통 설정.

안전장치: 테스트는 반드시 별도 DB(erp_test)에서만 실행한다. 운영/개발 DB(erp_db)는 절대 건드리지 않는다.
- 접속 정보는 backend/.env 의 DATABASE_URL에서 DB 이름만 erp_test 로 바꿔 만든다 (비밀번호를 코드에 쓰지 않는다).
- app 을 import 하기 전에 환경변수 DATABASE_URL 을 덮어써야 하므로 이 파일 맨 위에서 먼저 처리한다.
- 각 테스트는 바깥 트랜잭션 안에서 실행되고 끝나면 롤백된다 (테스트끼리 데이터가 섞이지 않는다).
"""
import os
from datetime import date
from pathlib import Path

from dotenv import dotenv_values

TEST_DB_NAME = "erp_test"
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _build_test_database_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    base_url = os.environ.get("DATABASE_URL") or dotenv_values(env_path).get("DATABASE_URL")
    assert base_url, "backend/.env 에 DATABASE_URL 이 필요합니다."
    prefix, _, _db_name = base_url.rpartition("/")
    return f"{prefix}/{TEST_DB_NAME}"


os.environ["DATABASE_URL"] = _build_test_database_url()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import models  # noqa: E402,F401  (테이블 메타데이터 등록)
from app.config import settings  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.database import Base, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.client import Client  # noqa: E402
from app.models.user import JobGrade, JobTitle, User, UserRole  # noqa: E402

# 최후의 안전장치: DB 이름이 erp_test 가 아니면 테스트를 시작하지 않는다.
assert settings.database_url.rsplit("/", 1)[-1] == TEST_DB_NAME, "테스트는 erp_test DB에서만 실행할 수 있습니다."
assert engine.url.database == TEST_DB_NAME


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    """테스트 DB 를 비우고 Alembic 리비전으로 구조를 만든다 (create_all 이 아니라 실제 배포와 같은 방법).
    리비전 파일이 잘못되면 여기서 실패한다."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")
    yield


@pytest.fixture()
def db():
    """테스트마다 롤백되는 세션. 코드 안의 db.commit()은 SAVEPOINT 해제로만 동작한다."""
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", autoflush=False)
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture()
def client(db):
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    # with 문 없이 사용해 startup 이벤트(마이그레이션·정기이체 생성)를 실행하지 않는다.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _reset_login_throttle():
    """로그인 실패 기록은 프로세스 메모리에 있으므로 테스트마다 비운다 (테스트끼리 영향을 주지 않게)."""
    from app.routers.auth import login_throttle

    login_throttle.reset()
    yield
    login_throttle.reset()


_user_seq = {"n": 0}


@pytest.fixture()
def make_user(db):
    def _make(role=UserRole.employee, title=None, menu_permissions=None, is_active=True, name=None) -> User:
        _user_seq["n"] += 1
        n = _user_seq["n"]
        user = User(
            employee_no=f"T{n:04d}",
            email=f"user{n}@test.local",
            name=name or f"테스트{n}",
            hashed_password=hash_password("pw-for-test"),
            role=role,
            grade=JobGrade.staff,
            title=title,
            hire_date=date(2020, 1, 1),
            is_active=is_active,
            menu_permissions=menu_permissions or [],
        )
        db.add(user)
        db.flush()
        return user

    return _make


@pytest.fixture()
def auth_headers():
    def _headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.email)}"}

    return _headers


@pytest.fixture()
def make_client(db, make_user):
    def _make(name="테스트거래처", receivable=0, payable=0, creator: User | None = None) -> Client:
        creator = creator or make_user(role=UserRole.admin, title=JobTitle.ceo)
        c = Client(name=name, receivable_amount=receivable, payable_amount=payable, created_by=creator.id)
        db.add(c)
        db.flush()
        return c

    return _make
