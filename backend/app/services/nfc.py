"""NFC 카드 번호(UID) 처리: 입력 정리, 저장용 HMAC 값, 화면 표시용 끝 4자리.

카드 번호는 비밀값이 아니지만 사원증 번호이므로 DB 에는 그대로 저장하지 않고, 로그·감사 기록에도 끝 4자리만 남긴다.
"""
import hashlib
import hmac
import re

from app.config import settings

# MIFARE/NTAG 등 ISO14443A 카드의 UID 길이: 4, 7, 10바이트
VALID_UID_HEX_LENGTHS = (8, 14, 20)
_SEPARATORS = re.compile(r"[\s:\-]")
_HEX = re.compile(r"^[0-9A-F]+$")


def normalize_uid(raw: str) -> str:
    """공백·콜론·하이픈을 없애고 대문자 16진수로 만든다. 형식이 틀리면 ValueError."""
    uid = _SEPARATORS.sub("", raw or "").upper()
    if not uid or not _HEX.match(uid):
        raise ValueError("카드 번호는 16진수(0-9, A-F)로 입력하세요. 예: 04A1B2C3")
    if len(uid) not in VALID_UID_HEX_LENGTHS:
        raise ValueError("카드 번호 길이가 올바르지 않습니다 (4, 7, 10바이트 = 16진수 8, 14, 20자리).")
    return uid


def _secret() -> bytes:
    if settings.nfc_uid_secret:
        return settings.nfc_uid_secret.encode()
    # 따로 지정하지 않으면 JWT 비밀키에서 파생한다 (용도를 나누기 위해 접두어를 붙여 해시)
    return hashlib.sha256(b"bench-nfc-uid:" + settings.jwt_secret_key.encode()).digest()


def uid_hash(uid: str) -> str:
    return hmac.new(_secret(), uid.encode(), hashlib.sha256).hexdigest()


def uid_last4(uid: str) -> str:
    return uid[-4:]
