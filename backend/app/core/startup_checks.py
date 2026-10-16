"""서버 시작 시 보안 설정 점검.

JWT 비밀키가 기본값(또는 너무 짧은 값)이면 누구나 로그인 토큰을 만들어 낼 수 있다. 운영 환경(ENVIRONMENT=production)에서는
이런 설정으로 서버가 시작되지 않게 막고, 개발 환경에서는 경고만 남긴다.
"""
import logging

from app.config import Settings

# 코드에 기본값으로 들어 있거나 예시 문서에 쓰이는 값들. 이 값이 그대로 쓰이면 안전하지 않다.
INSECURE_JWT_SECRETS = {"dev-only-change-me", "change-me", "changeme", "secret", ""}
MIN_JWT_SECRET_LENGTH = 32


def find_security_problems(s: Settings) -> list[str]:
    """안전하지 않은 설정을 사람이 읽을 수 있는 문장 목록으로 돌려준다 (없으면 빈 목록)."""
    problems: list[str] = []
    secret = s.jwt_secret_key
    if secret in INSECURE_JWT_SECRETS:
        problems.append("JWT_SECRET_KEY 가 기본값입니다. backend/.env 에 임의의 긴 값을 지정하세요.")
    elif len(secret) < MIN_JWT_SECRET_LENGTH:
        problems.append(f"JWT_SECRET_KEY 가 너무 짧습니다 ({MIN_JWT_SECRET_LENGTH}자 이상 권장).")
    return problems


def enforce_security_settings(s: Settings, logger: logging.Logger) -> None:
    """운영 환경이면 문제가 있을 때 RuntimeError 로 시작을 막고, 그 외에는 경고 로그만 남긴다."""
    problems = find_security_problems(s)
    if not problems:
        return
    if s.environment.lower() == "production":
        for p in problems:
            logger.error(f"[Startup] 보안 설정 오류: {p}")
        raise RuntimeError("운영 환경의 보안 설정이 안전하지 않아 서버를 시작할 수 없습니다: " + " ".join(problems))
    for p in problems:
        logger.warning(f"[Startup] 보안 설정 경고(개발 환경이라 계속 진행): {p}")
