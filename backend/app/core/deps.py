from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.audit import set_current_user
from app.core.security import decode_access_payload
from app.database import get_db
from app.logging_config import get_logger
from app.models.client_device import ClientDevice, DeviceStatus
from app.models.nfc_card import NfcCard
from app.models.user import User, UserRole, has_menu_permission, is_admin_role, is_dept_head_or_above

logger = get_logger("Deps")

bearer_scheme = HTTPBearer(auto_error=False)


def resolve_user(db: Session, token: str) -> User:
    """토큰이 가리키는 사용 가능한 직원을 돌려준다. 문제가 있으면 401. (HTTP 요청과 WebSocket 인증이 함께 쓴다)"""
    claims = decode_access_payload(token)
    if claims is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다.")
    email = claims["sub"]

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        logger.debug(f"[Auth] 사용자 조회 실패 또는 비활성 계정: email={email}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")

    if claims.get("amr") == "nfc":
        _ensure_nfc_session_valid(db, claims)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        logger.debug("[Auth] 인증 헤더 없음")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다.")

    user = resolve_user(db, credentials.credentials)
    set_current_user(user)  # 감사 로그의 "누가"
    return user


def _ensure_nfc_session_valid(db: Session, claims: dict) -> None:
    """카드 로그인으로 받은 토큰은 카드와 기기가 계속 사용 가능할 때만 통한다 (사용 중지하면 이미 받은 토큰도 바로 막힌다)."""
    device = db.get(ClientDevice, claims.get("did")) if isinstance(claims.get("did"), int) else None
    card = db.get(NfcCard, claims.get("cid")) if isinstance(claims.get("cid"), int) else None
    if device is None or device.status != DeviceStatus.approved.value or card is None or not card.is_active:
        logger.debug(f"[Auth] 카드 로그인 토큰 거절: 기기 또는 카드가 더 이상 사용 가능하지 않음 (did={claims.get('did')}, cid={claims.get('cid')})")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="카드 또는 기기가 사용 중지되어 다시 로그인해야 합니다.")


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


def require_menu_access_dept_head(menu_key: str):
    """해당 메뉴 권한이 있고(대표는 항상 허용) 동시에 부서장 이상 직책인 경우에만 허용 — 삭제처럼 책임이 필요한 작업에 사용."""

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if has_menu_permission(current_user, menu_key) and is_dept_head_or_above(current_user):
            return current_user
        logger.debug(f"[Auth] 부서장 이상 + 메뉴 권한 필요, 접근 거부: user_id={current_user.id}, menu={menu_key}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="부서장 이상만 삭제할 수 있습니다.")

    return _dependency
