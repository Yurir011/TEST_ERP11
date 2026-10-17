from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("Security")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra_claims: dict | None = None, expire_minutes: int | None = None) -> str:
    """로그인 토큰. extra_claims 는 카드 로그인(amr, 기기·카드 번호)처럼 발급 방식을 담는 값이다."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes or settings.jwt_expire_minutes)
    payload = {**(extra_claims or {}), "sub": subject, "exp": expire}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    logger.debug(f"[Security] 액세스 토큰 발급: subject={subject}, expire={expire.isoformat()}, 방식={(extra_claims or {}).get('amr', 'password')}")
    return token


def decode_access_payload(token: str) -> dict | None:
    """토큰이 올바르면 내용(claims)을, 아니면 None."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        logger.debug(f"[Security] 토큰 검증 실패: {exc}")
        return None
    return payload if payload.get("sub") else None


def decode_access_token(token: str) -> str | None:
    payload = decode_access_payload(token)
    return payload.get("sub") if payload else None
