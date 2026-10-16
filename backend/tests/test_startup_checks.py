"""서버 시작 시 보안 설정 점검(core/startup_checks.py) 테스트."""
import logging

import pytest

from app.config import Settings
from app.core.startup_checks import enforce_security_settings, find_security_problems

GOOD_SECRET = "x" * 48
logger = logging.getLogger("test-startup")


def make_settings(**kw) -> Settings:
    # .env 파일을 읽지 않고 값을 직접 지정한다 (실제 설정에 영향받지 않는다)
    return Settings(_env_file=None, **kw)


def test_default_values_are_safe_for_development_defaults():
    s = make_settings()
    assert s.environment == "development"
    assert s.log_level == "INFO"  # 기본 로그 레벨은 INFO (개발 PC 는 .env 로 DEBUG 지정)


def test_default_secret_is_a_problem():
    assert find_security_problems(make_settings(jwt_secret_key="dev-only-change-me"))
    assert find_security_problems(make_settings(jwt_secret_key=""))
    assert find_security_problems(make_settings())  # 코드의 기본값도 문제로 본다


def test_short_secret_is_a_problem():
    assert find_security_problems(make_settings(jwt_secret_key="short-secret"))


def test_long_random_secret_is_ok():
    assert find_security_problems(make_settings(jwt_secret_key=GOOD_SECRET)) == []


def test_production_refuses_to_start_with_insecure_secret():
    s = make_settings(environment="production", jwt_secret_key="dev-only-change-me")
    with pytest.raises(RuntimeError):
        enforce_security_settings(s, logger)


def test_production_environment_name_is_case_insensitive():
    s = make_settings(environment="Production", jwt_secret_key="short")
    with pytest.raises(RuntimeError):
        enforce_security_settings(s, logger)


def test_production_with_good_secret_starts():
    enforce_security_settings(make_settings(environment="production", jwt_secret_key=GOOD_SECRET), logger)


def test_development_only_warns(caplog):
    s = make_settings(environment="development", jwt_secret_key="dev-only-change-me")
    with caplog.at_level(logging.WARNING, logger="test-startup"):
        enforce_security_settings(s, logger)  # 예외 없이 계속 진행
    assert any("경고" in r.message for r in caplog.records)
