"""NFC 카드 로그인.

흐름: 앱이 카드 번호를 읽음 → /challenge 로 1회용 nonce 를 받음 → (nonce, 카드 번호)에 기기 비밀키로 서명 → /login.
서버는 ① 승인된 기기인지 ② nonce 가 유효한지 ③ 서명이 맞는지 ④ 사용 중인 카드인지 ⑤ 활성 직원인지 확인한 뒤 토큰을 준다.
카드 번호는 비밀값이 아니라 복제될 수 있으므로, 서명으로 "승인된 PC 에서 온 요청"임을 함께 확인하는 것이 핵심이다.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.audit import record_event, set_current_user
from app.core.login_throttle import LoginThrottle, ThrottleRule
from app.core.nfc_challenges import ChallengeStore
from app.core.security import create_access_token
from app.database import get_db
from app.logging_config import get_logger
from app.models.client_device import ClientDevice, DeviceStatus
from app.models.nfc_card import NfcCard
from app.models.user import User
from app.schemas.nfc import NfcChallengeOut, NfcChallengeRequest, NfcLoginRequest
from app.schemas.user import TokenResponse
from app.services.nfc import uid_hash, uid_last4
from app.services.nfc_signature import verify_login_signature

router = APIRouter(prefix="/api/auth/nfc", tags=["auth"])
logger = get_logger("NFC")

challenges = ChallengeStore(ttl_seconds=settings.nfc_challenge_ttl_seconds)
# 기기별·접속 주소별로 실패를 센다 (비밀번호 로그인과 같은 규칙, 따로 센다)
nfc_throttle = LoginThrottle(
    email_rule=ThrottleRule(settings.login_max_failures, settings.login_window_seconds, settings.login_lockout_seconds),
    ip_rule=ThrottleRule(settings.login_ip_max_failures, settings.login_window_seconds, settings.login_lockout_seconds),
)

NOT_APPROVED = "이 PC 는 아직 승인되지 않았습니다. 관리자에게 기기 승인을 요청하세요."
BAD_CARD = "등록되지 않았거나 사용할 수 없는 카드입니다."


def _throttle_key(public_key: str) -> str:
    return f"nfc-device:{public_key}"


def _approved_device(db: Session, public_key: str) -> ClientDevice | None:
    device = db.query(ClientDevice).filter(ClientDevice.public_key == public_key).first()
    return device if device is not None and device.status == DeviceStatus.approved.value else None


@router.post("/challenge", response_model=NfcChallengeOut)
def issue_challenge(payload: NfcChallengeRequest, db: Session = Depends(get_db)):
    key = payload.public_key.lower()
    if _approved_device(db, key) is None:
        logger.debug(f"[NFC] 승인되지 않은 기기의 확인값 요청 거절: 공개키 {key[:8]}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_APPROVED)
    return NfcChallengeOut(nonce=challenges.issue(key), expires_in=settings.nfc_challenge_ttl_seconds)


def _fail(db: Session, throttle_id: str, ip: str | None, status_code: int, detail: str, summary: str, user_id: int | None = None) -> HTTPException:
    """실패를 센 뒤 기록하고, 돌려줄 예외를 만든다 (호출한 쪽이 raise)."""
    nfc_throttle.record_failure(throttle_id, ip)
    record_event(db, "nfc_login_failed", "user", user_id, summary)
    db.commit()
    return HTTPException(status_code=status_code, detail=detail)


@router.post("/login", response_model=TokenResponse)
def nfc_login(payload: NfcLoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    key = payload.public_key.lower()
    uid = payload.uid  # 스키마가 정리해 둔 대문자 16진수
    throttle_id = _throttle_key(key)
    logger.debug(f"[NFC] 카드 로그인 시도: 기기 {key[:8]}, 카드 끝 4자리 {uid_last4(uid)}, ip={ip}")

    wait = nfc_throttle.retry_after(throttle_id, ip)
    if wait > 0:
        logger.warning(f"[NFC] 카드 로그인 시도 제한 중: 기기 {key[:8]}, ip={ip}, 남은 {wait}초")
        record_event(db, "nfc_login_blocked", "user", None, f"카드 로그인 차단(시도 제한): 기기 {key[:8].upper()}")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"카드 로그인에 여러 번 실패해 잠시 막혔습니다. 약 {(wait + 59) // 60}분 뒤에 다시 시도해주세요.",
            headers={"Retry-After": str(wait)},
        )

    # nonce 는 맞든 틀리든 한 번 꺼내면 지운다
    nonce_ok = challenges.consume(payload.nonce, key)
    device = _approved_device(db, key)
    if device is None:
        raise _fail(db, throttle_id, ip, status.HTTP_403_FORBIDDEN, NOT_APPROVED, f"카드 로그인 실패: 승인되지 않은 기기 {key[:8].upper()}")
    if not nonce_ok:
        # 시간이 지나 만료된 경우가 대부분이라 실패 횟수에는 넣지 않는다 (앱이 카드를 다시 대면 된다)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증 시간이 지났습니다. 카드를 다시 대세요.")
    if not verify_login_signature(key, payload.nonce, uid, payload.signature):
        raise _fail(db, throttle_id, ip, status.HTTP_401_UNAUTHORIZED, "기기 인증에 실패했습니다.", f"카드 로그인 실패: 서명 불일치 (기기 {device.name})")

    card = db.query(NfcCard).filter(NfcCard.uid_hmac == uid_hash(uid)).first()
    if card is None or not card.is_active:
        raise _fail(db, throttle_id, ip, status.HTTP_401_UNAUTHORIZED, BAD_CARD, f"카드 로그인 실패: 등록되지 않았거나 중지된 카드 (끝 4자리 {uid_last4(uid)}, 기기 {device.name})")

    user = db.get(User, card.user_id)
    if user is None or not user.is_active:
        raise _fail(db, throttle_id, ip, status.HTTP_403_FORBIDDEN, "비활성화된 계정입니다.", f"카드 로그인 실패: 비활성 계정 (끝 4자리 {uid_last4(uid)})", user.id if user else None)

    now = datetime.now(timezone.utc)
    card.last_used_at = now
    device.last_seen_at = now
    device.last_ip = ip
    nfc_throttle.record_success(throttle_id, ip)
    set_current_user(user)
    record_event(db, "nfc_login_success", "user", user.id, f"카드 로그인: {user.name} ({user.email}), 카드 끝 4자리 {card.uid_last4}, 기기 {device.name}")
    db.commit()
    token = create_access_token(
        subject=user.email,
        extra_claims={"amr": "nfc", "did": device.id, "cid": card.id},
        expire_minutes=settings.nfc_token_expire_minutes,
    )
    logger.info(f"[NFC] 카드 로그인 성공: user_id={user.id}, 기기={device.name}, 카드 끝 4자리={card.uid_last4}")
    return TokenResponse(access_token=token)
