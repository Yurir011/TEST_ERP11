"""모바일 푸시(FCM) 기기 토큰 등록·해제. 앱(/m 화면)이 로그인 후 등록하고, 로그아웃할 때 해제한다."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.device_token import DeviceToken
from app.models.user import User
from app.schemas.push import DeviceTokenDelete, DeviceTokenIn

router = APIRouter(prefix="/api/push", tags=["push"])
logger = get_logger("Push")


def _short(token: str) -> str:
    """토큰은 비밀 값이라 로그에는 앞 8자만 남긴다."""
    return f"{token[:8]}…"


@router.post("/devices", status_code=status.HTTP_204_NO_CONTENT)
def register_device(payload: DeviceTokenIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """이 기기의 토큰을 로그인한 직원 소유로 등록한다. 이미 있는 토큰이면 주인(user_id)과 정보를 갱신한다 (계정을 바꿔 로그인한 폰)."""
    row = db.query(DeviceToken).filter(DeviceToken.token == payload.token).first()
    if row is None:
        db.add(
            DeviceToken(
                user_id=current_user.id, token=payload.token, platform=payload.platform,
                device_name=payload.device_name, app_version=payload.app_version,
            )
        )
        logger.debug(f"[Push] 토큰 등록: user_id={current_user.id}, platform={payload.platform}, token={_short(payload.token)}")
    else:
        if row.user_id != current_user.id:
            logger.debug(f"[Push] 토큰 주인 변경(계정 전환): {row.user_id} → {current_user.id}, token={_short(payload.token)}")
        row.user_id = current_user.id
        row.platform = payload.platform
        row.device_name = payload.device_name
        row.app_version = payload.app_version
        row.last_seen_at = datetime.now(timezone.utc)
        logger.debug(f"[Push] 토큰 갱신: user_id={current_user.id}, token={_short(payload.token)}")
    db.commit()


@router.delete("/devices", status_code=status.HTTP_204_NO_CONTENT)
def unregister_device(payload: DeviceTokenDelete, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """로그아웃한 폰이 알림을 받지 않도록 토큰을 지운다. 내 토큰만 지울 수 있고, 남의 토큰이나 없는 토큰은 조용히 넘어간다."""
    deleted = db.query(DeviceToken).filter(DeviceToken.token == payload.token, DeviceToken.user_id == current_user.id).delete()
    db.commit()
    logger.debug(f"[Push] 토큰 해제: user_id={current_user.id}, deleted={deleted}, token={_short(payload.token)}")
