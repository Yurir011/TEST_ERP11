"""업로드 파일 검사.

브라우저가 보내는 Content-Type 헤더는 사용자가 마음대로 바꿀 수 있다. 그래서 헤더만 믿지 않고 **파일 앞부분의 서명(매직 바이트)**
으로 실제 형식을 확인한다. 예: 확장자와 헤더만 .jpg 로 바꾼 실행 파일이나 HTML 은 거절된다.

사용: content = read_upload(file, IMAGE_TYPES) — 형식·크기가 맞으면 파일 내용을 돌려주고, 아니면 400 오류를 낸다.
"""
from fastapi import HTTPException, UploadFile, status

from app.logging_config import get_logger

logger = get_logger("UploadCheck")

DEFAULT_MAX_BYTES = 15 * 1024 * 1024  # 15MB

# 형식 이름 → 파일 앞부분 서명 판별
_KIND_LABELS = {
    "jpeg": "JPG 이미지",
    "png": "PNG 이미지",
    "webp": "WEBP 이미지",
    "gif": "GIF 이미지",
    "pdf": "PDF",
    "ole": "오피스 문서(구버전)",
    "zip": "오피스 문서/압축 파일",
    "text": "텍스트",
}

# 허용 목록 (Content-Type → 형식 이름). 라우터는 필요한 것을 골라 쓴다.
IMAGE_TYPES = {"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}
IMAGE_OR_PDF_TYPES = {**IMAGE_TYPES, "application/pdf": "pdf"}
ATTACHMENT_TYPES = {
    **IMAGE_OR_PDF_TYPES,
    "image/gif": "gif",
    "application/msword": "ole",
    "application/vnd.ms-excel": "ole",
    "application/vnd.ms-powerpoint": "ole",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "zip",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "zip",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "zip",
    "application/zip": "zip",
    "text/plain": "text",
}

# Content-Type → 저장할 확장자 (파일 이름에서 확장자를 가져오지 않는다)
EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "text/plain": "txt",
}


def sniff_kind(content: bytes) -> str | None:
    """파일 앞부분 서명으로 형식을 판별한다. 알 수 없으면 None."""
    if content.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if content.startswith(b"%PDF-"):
        return "pdf"
    if content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "ole"
    if content.startswith(b"PK\x03\x04"):
        return "zip"
    return None


def _looks_like_text(content: bytes) -> bool:
    """서명이 없는 텍스트 파일: NUL 바이트가 없고 UTF-8 또는 CP949 로 읽히면 텍스트로 본다."""
    head = content[:8192]
    if b"\x00" in head:
        return False
    for encoding in ("utf-8", "cp949"):
        try:
            head.decode(encoding)
            return True
        except UnicodeDecodeError:
            continue
    return False


def check_content(content: bytes, content_type: str | None, allowed: dict[str, str], max_bytes: int = DEFAULT_MAX_BYTES) -> None:
    """형식·크기를 검사하고, 문제가 있으면 사용자에게 보여줄 메시지와 함께 400 오류를 낸다."""
    if content_type not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 파일 형식입니다.")
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="빈 파일입니다.")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"파일 크기는 {max_bytes // (1024 * 1024)}MB를 초과할 수 없습니다."
        )
    expected = allowed[content_type]
    actual = "text" if expected == "text" and _looks_like_text(content) else sniff_kind(content)
    if actual != expected:
        logger.warning(f"[UploadCheck] 파일 내용 불일치: content_type={content_type}, 판별={actual}, size={len(content)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"파일 내용이 {_KIND_LABELS[expected]} 형식이 아닙니다. 파일을 확인해주세요.",
        )


def read_upload(file: UploadFile, allowed: dict[str, str], max_bytes: int = DEFAULT_MAX_BYTES) -> bytes:
    """업로드 파일을 읽어 형식·크기를 검사한 뒤 내용을 돌려준다."""
    if file.content_type not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 파일 형식입니다.")
    content = file.file.read(max_bytes + 1)  # 한도보다 1바이트 더 읽어 초과 여부만 판단한다
    check_content(content, file.content_type, allowed, max_bytes)
    return content
