from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.logging_config import get_logger
from app.models.user import User, UserRole, has_menu_permission, is_admin_role

logger = get_logger("Deps")

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        logger.debug("[Auth] 인증 헤더 없음")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")

    email = decode_access_token(credentials.credentials)
    if email is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다.")

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        logger.debug(f"[Auth] 사용자 조회 실패 또는 비활성 계정: email={email}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        logger.debug(f"[Auth] 관리자 권한 필요, 접근 거부: user_id={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
    return current_user


def require_admin_or_site_admin(current_user: User = Depends(get_current_user)) -> User:
    """대표(admin) 또는 사이트 관리자(site_admin) 전용 — 설정/공지사항 관리처럼 사이트 관리자 모드에도 열려있는 기능에 사용."""
    if not is_admin_role(current_user.role):
        logger.debug(f"[Auth] 관리자/사이트 관리자 권한 필요, 접근 거부: user_id={current_user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
    return current_user


def require_menu_access(menu_key: str):
    """대표(admin)는 항상 허용, 일반직원은 관리자가 개별로 부여한 menu_permissions에 포함된 경우에만 허용.
    사이트 관리자(site_admin)는 이 메뉴들의 사용 대상이 아니므로 제외한다.
    """

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if has_menu_permission(current_user, menu_key):
            return current_user
        logger.debug(f"[Auth] 메뉴 권한 없음, 접근 거부: user_id={current_user.id}, menu={menu_key}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근 권한이 없습니다.")

    return _dependency
