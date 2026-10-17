"""카드 로그인 서명 확인. 기기(데스크톱 앱)가 Ed25519 비밀키로 서명한 값을 공개키로 확인한다.

서명하는 글: `bench-nfc-login|<nonce>|<카드 번호(대문자 16진수)>`
앱(desktop/src/nfcLogin.ts)과 이 서버가 같은 글을 만들어야 하므로 형식을 바꾸면 양쪽을 함께 바꾼다.
"""
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

LOGIN_MESSAGE_PREFIX = "bench-nfc-login"


def login_message(nonce: str, uid: str) -> bytes:
    return f"{LOGIN_MESSAGE_PREFIX}|{nonce}|{uid}".encode()


def verify_login_signature(public_key_hex: str, nonce: str, uid: str, signature_hex: str) -> bool:
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        key.verify(bytes.fromhex(signature_hex), login_message(nonce, uid))
        return True
    except (InvalidSignature, ValueError):
        return False
