from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.database import get_db
from app.logging_config import get_logger
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = get_logger("Auth")


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    logger.debug(f"[Auth] 로그인 시도: email={payload.email}")
    user = db.query(User).filter(User.email == payload.email).first()

    if user is None or not verify_password(payload.password, user.hashed_password):
        logger.debug(f"[Auth] 로그인 실패: email={payload.email}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    if not user.is_active:
        logger.debug(f"[Auth] 비활성 계정 로그인 시도: email={payload.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비활성화된 계정입니다.")

    token = create_access_token(subject=user.email)
    logger.debug(f"[Auth] 로그인 성공: email={payload.email}, role={user.role}")
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    logger.debug(f"[Auth] 내 정보 조회: user_id={current_user.id}")
    return current_user
