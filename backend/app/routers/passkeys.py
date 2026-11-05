"""패스키(WebAuthn) 로그인: 폰·PC의 지문·얼굴 인식으로 로그인한다.

흐름
- 등록(이미 로그인한 직원): register/options 로 challenge 를 받아 기기에서 패스키를 만들고 → register/verify 로 서버가 공개키를 저장한다.
- 로그인(로그인 전): login/options 로 challenge 를 받아 기기가 서명하고 → login/verify 로 서버가 서명을 확인한 뒤 로그인 토큰을 준다.
서명 검증은 검증된 라이브러리(py_webauthn)가 한다. 서버에는 공개키만 저장되고 개인키는 기기 밖으로 나오지 않는다.

패스키는 도메인에 묶이고 HTTPS 에서만 동작한다. 도메인은 .env 의 WEBAUTHN_RP_ID, 허용 주소는 WEBAUTHN_ORIGINS 로 지정하고,
둘 중 하나라도 비어 있으면 패스키 기능은 꺼진 상태(503)로 둔다. 비밀번호 로그인은 처음 등록할 때와 분실에 대비해 그대로 남는다.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import options_to_json_dict
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import settings
from app.core.audit import record_event, set_current_user
from app.core.deps import get_current_user
from app.core.login_throttle import LoginThrottle, ThrottleRule
from app.core.passkey_challenges import PasskeyChallengeStore
from app.core.security import create_access_token
from app.database import get_db
from app.logging_config import get_logger
from app.models.passkey import PasskeyCredential
from app.models.user import User, is_admin_role
from app.schemas.user import TokenResponse

router = APIRouter(prefix="/api/passkeys", tags=["passkeys"])
logger = get_logger("Passkeys")

MAX_PASSKEYS_PER_USER = 5

challenges = PasskeyChallengeStore(ttl_seconds=settings.webauthn_challenge_ttl_seconds)

# 패스키 로그인 실패를 접속 주소(IP)별로 센다. 남의 계정을 잠그는 방해가 되지 않도록 계정이 아니라 주소만 본다.
_ip_rule = ThrottleRule(settings.login_ip_max_failures, settings.login_window_seconds, settings.login_lockout_seconds)
passkey_throttle = LoginThrottle(email_rule=_ip_rule, ip_rule=_ip_rule)


class PasskeyOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    last_used_at: datetime | None


class StatusOut(BaseModel):
    enabled: bool


class OptionsOut(BaseModel):
    challenge_id: str
    options: dict


class RegisterVerifyIn(BaseModel):
    challenge_id: str
    credential: dict
    name: str = Field(min_length=1, max_length=100)


class LoginVerifyIn(BaseModel):
    challenge_id: str
    credential: dict


def _enabled() -> bool:
    return bool(settings.webauthn_rp_id and settings.webauthn_origins)


def _require_enabled() -> None:
    if not _enabled():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="패스키 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.")


def _to_out(pc: PasskeyCredential) -> PasskeyOut:
    return PasskeyOut(id=pc.id, name=pc.name, created_at=pc.created_at, last_used_at=pc.last_used_at)


@router.get("/status", response_model=StatusOut)
def passkey_status():
    """로그인 화면이 [지문·얼굴로 로그인] 버튼을 보여 줄지 정하는 데 쓴다 (로그인 전에도 부를 수 있다)."""
    return StatusOut(enabled=_enabled())


@router.get("", response_model=list[PasskeyOut])
def list_my_passkeys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(PasskeyCredential).filter(PasskeyCredential.user_id == current_user.id).order_by(PasskeyCredential.id).all()
    return [_to_out(r) for r in rows]


@router.post("/register/options", response_model=OptionsOut)
def register_options(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_enabled()
    existing = db.query(PasskeyCredential).filter(PasskeyCredential.user_id == current_user.id).all()
    if len(existing) >= MAX_PASSKEYS_PER_USER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"패스키는 최대 {MAX_PASSKEYS_PER_USER}개까지 등록할 수 있습니다. 쓰지 않는 패스키를 먼저 삭제해주세요.")
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=str(current_user.id).encode(),
        user_name=current_user.email,
        user_display_name=current_user.name,
        exclude_credentials=[PublicKeyCredentialDescriptor(id=pc.credential_id) for pc in existing],  # 같은 기기에 중복 등록 방지
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,  # 폰·PC에 내장된 지문·얼굴 인식
            resident_key=ResidentKeyRequirement.REQUIRED,  # 이메일을 입력하지 않고 바로 로그인할 수 있게
            user_verification=UserVerificationRequirement.REQUIRED,  # 반드시 지문·얼굴·화면 잠금으로 본인 확인
        ),
    )
    challenge_id = challenges.issue("register", current_user.id, options.challenge)
    logger.debug(f"[Passkeys] 등록 시작: user_id={current_user.id}")
    return OptionsOut(challenge_id=challenge_id, options=options_to_json_dict(options))


@router.post("/register/verify", response_model=PasskeyOut, status_code=status.HTTP_201_CREATED)
def register_verify(payload: RegisterVerifyIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_enabled()
    challenge = challenges.consume(payload.challenge_id, "register", current_user.id)
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="확인 시간이 지났습니다. 처음부터 다시 등록해주세요.")
    try:
        verified = verify_registration_response(
            credential=payload.credential,
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=list(settings.webauthn_origins),
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001 - 라이브러리가 던지는 모든 검증 실패를 같은 안내로 돌려준다
        logger.warning(f"[Passkeys] 등록 검증 실패: user_id={current_user.id}, {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="패스키를 등록하지 못했습니다. 다시 시도해주세요.") from exc

    if db.query(PasskeyCredential).filter(PasskeyCredential.credential_id == verified.credential_id).first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 등록된 패스키입니다.")
    pc = PasskeyCredential(
        user_id=current_user.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        name=payload.name.strip() or "내 기기",
    )
    db.add(pc)
    db.flush()
    record_event(db, "passkey_registered", "user", current_user.id, f"패스키 등록: {current_user.name} ({pc.name})")
    db.commit()
    db.refresh(pc)
    logger.debug(f"[Passkeys] 등록 완료: user_id={current_user.id}, passkey_id={pc.id}")
    return _to_out(pc)


@router.post("/login/options", response_model=OptionsOut)
def login_options():
    _require_enabled()
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        user_verification=UserVerificationRequirement.REQUIRED,
    )  # allow_credentials 를 비워 두면 기기가 이 사이트의 패스키 중 하나를 골라 보여 준다
    challenge_id = challenges.issue("login", None, options.challenge)
    return OptionsOut(challenge_id=challenge_id, options=options_to_json_dict(options))


def _login_failed(db: Session, key: str, ip: str | None, why: str) -> HTTPException:
    passkey_throttle.record_failure(key, ip)
    logger.warning(f"[Passkeys] 로그인 실패: ip={ip}, 사유={why}")
    record_event(db, "login_failed", "user", None, f"패스키 로그인 실패: {why}")
    db.commit()
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="패스키로 로그인하지 못했습니다. 비밀번호로 로그인해주세요.")


@router.post("/login/verify", response_model=TokenResponse)
def login_verify(payload: LoginVerifyIn, request: Request, db: Session = Depends(get_db)):
    _require_enabled()
    ip = request.client.host if request.client else None
    key = f"ip:{ip or 'unknown'}"
    wait = passkey_throttle.retry_after(key, ip)
    if wait > 0:
        logger.warning(f"[Passkeys] 로그인 시도 제한 중: ip={ip}, 남은 {wait}초")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"로그인에 여러 번 실패해 잠시 막혔습니다. 약 {(wait + 59) // 60}분 뒤에 다시 시도해주세요.",
            headers={"Retry-After": str(wait)},
        )

    challenge = challenges.consume(payload.challenge_id, "login")
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="확인 시간이 지났습니다. 다시 시도해주세요.")

    try:
        credential_id = base64url_to_bytes(str(payload.credential.get("rawId") or payload.credential.get("id") or ""))
    except Exception as exc:  # noqa: BLE001
        raise _login_failed(db, key, ip, "패스키 식별값 형식 오류") from exc
    pc = db.query(PasskeyCredential).filter(PasskeyCredential.credential_id == credential_id).first()
    if pc is None:
        raise _login_failed(db, key, ip, "등록되지 않은 패스키")

    try:
        verified = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=list(settings.webauthn_origins),
            credential_public_key=pc.public_key,
            credential_current_sign_count=pc.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise _login_failed(db, key, ip, f"서명 검증 실패({type(exc).__name__})") from exc

    user = pc.user
    if not user.is_active:
        logger.debug(f"[Passkeys] 비활성 계정 로그인 시도: user_id={user.id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비활성화된 계정입니다.")

    pc.sign_count = verified.new_sign_count
    pc.last_used_at = datetime.now(timezone.utc)
    passkey_throttle.record_success(key, ip)
    set_current_user(user)
    record_event(db, "login_success", "user", user.id, f"패스키 로그인: {user.name} ({pc.name})")
    db.commit()
    token = create_access_token(subject=user.email, extra_claims={"amr": "passkey"})
    logger.debug(f"[Passkeys] 로그인 성공: user_id={user.id}, passkey_id={pc.id}")
    return TokenResponse(access_token=token)


@router.delete("/{passkey_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_passkey(passkey_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pc = db.query(PasskeyCredential).filter(PasskeyCredential.id == passkey_id, PasskeyCredential.user_id == current_user.id).first()
    if pc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="패스키를 찾을 수 없습니다.")
    record_event(db, "passkey_deleted", "user", current_user.id, f"패스키 삭제: {current_user.name} ({pc.name})")
    db.delete(pc)
    db.commit()
    logger.debug(f"[Passkeys] 삭제: user_id={current_user.id}, passkey_id={passkey_id}")
    return None


def _require_admin(user: User) -> None:
    if not is_admin_role(user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자만 사용할 수 있습니다.")


@router.get("/admin/{user_id}", response_model=list[PasskeyOut])
def admin_list_passkeys(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """관리자: 직원이 등록한 패스키 목록 (분실 신고를 받았을 때 확인한다)."""
    _require_admin(current_user)
    rows = db.query(PasskeyCredential).filter(PasskeyCredential.user_id == user_id).order_by(PasskeyCredential.id).all()
    return [_to_out(r) for r in rows]


@router.delete("/admin/{user_id}/{passkey_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_passkey(user_id: int, passkey_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """관리자: 직원의 패스키를 지운다 (폰을 잃어버렸을 때). 그 폰으로는 더 이상 패스키 로그인을 할 수 없다."""
    _require_admin(current_user)
    pc = db.query(PasskeyCredential).filter(PasskeyCredential.id == passkey_id, PasskeyCredential.user_id == user_id).first()
    if pc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="패스키를 찾을 수 없습니다.")
    record_event(db, "passkey_deleted", "user", user_id, f"관리자가 패스키 삭제: {pc.user.name} ({pc.name})")
    db.delete(pc)
    db.commit()
    logger.debug(f"[Passkeys] 관리자 삭제: admin_id={current_user.id}, user_id={user_id}, passkey_id={passkey_id}")
    return None
