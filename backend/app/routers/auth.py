from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.audit import record_event, set_current_user
from app.core.deps import get_current_user
from app.core.login_throttle import LoginThrottle, ThrottleRule
from app.core.security import create_access_token, verify_password
from app.database import get_db
from app.logging_config import get_logger
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = get_logger("Auth")

login_throttle = LoginThrottle(
    email_rule=ThrottleRule(settings.login_max_failures, settings.login_window_seconds, settings.login_lockout_seconds),
    ip_rule=ThrottleRule(settings.login_ip_max_failures, settings.login_window_seconds, settings.login_lockout_seconds),
)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    logger.debug(f"[Auth] 로그인 시도: email={payload.email}")
    client_ip = request.client.host if request.client else None

    # 실패가 반복되어 잠긴 상태면 비밀번호를 확인하지 않고 바로 거절한다 (맞는 비밀번호여도 잠금이 풀릴 때까지 로그인 불가).
    wait = login_throttle.retry_after(payload.email, client_ip)
    if wait > 0:
        logger.warning(f"[Auth] 로그인 시도 제한 중: email={payload.email}, ip={client_ip}, 남은 {wait}초")
        record_event(db, "login_blocked", "user", None, f"로그인 차단(시도 제한): {payload.email}")
        db.commit()
        minutes = (wait + 59) // 60
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"로그인에 여러 번 실패해 잠시 막혔습니다. 약 {minutes}분 뒤에 다시 시도해주세요.",
            headers={"Retry-After": str(wait)},
        )

    user = db.query(User).filter(User.email == payload.email).first()

    if user is None or not verify_password(payload.password, user.hashed_password):
        login_throttle.record_failure(payload.email, client_ip)
        logger.debug(f"[Auth] 로그인 실패: email={payload.email}")
        record_event(db, "login_failed", "user", user.id if user else None, f"로그인 실패: {payload.email}")
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    if not user.is_active:
        logger.debug(f"[Auth] 비활성 계정 로그인 시도: email={payload.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비활성화된 계정입니다.")

    login_throttle.record_success(payload.email, client_ip)
    set_current_user(user)
    record_event(db, "login_success", "user", user.id, f"로그인: {user.name} ({user.email})")
    db.commit()
    token = create_access_token(subject=user.email)
    logger.debug(f"[Auth] 로그인 성공: email={payload.email}, role={user.role}")
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    logger.debug(f"[Auth] 내 정보 조회: user_id={current_user.id}")
    return current_user
