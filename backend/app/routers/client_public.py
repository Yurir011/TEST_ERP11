"""데스크톱 앱 설치 파일 공개 내려받기 (로그인 없이).

로그인 화면과 사이드바 맨 아래의 "설치 파일 받기" 링크가 쓴다. 로그인하기 전의 직원도 설치 파일을 받을 수 있어야 하기 때문이다.
관리자가 설치 파일(예: BENCH-ERP_Setup_0.70.171.exe)을 프로젝트의 `release` 폴더(또는 `desktop/release`)에 넣어 두면 그중 가장 높은 버전을 알려 주고 내려준다.

보안: 이 두 주소는 **로그인 없이 열리는 유일한 앱 배포 주소**다. 그래서
 - 내려주는 파일은 폴더를 직접 훑어 정해진 형식의 이름(BENCH-ERP_Setup_<버전>.exe 등)과 일치하는 일반 파일뿐이다.
 - 요청에서 파일 이름이나 경로를 받지 않는다(받을 값이 없으니 ../ 로 다른 파일을 내려받게 할 수 없다).
 - 설치 파일에는 비밀번호·키가 들어 있지 않다(서버 주소만 들어 있고, 소스 저장소도 공개 상태다).
"""
import hashlib
import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.logging_config import get_logger
from app.version import format_version

router = APIRouter(prefix="/api/client/public", tags=["client-app"])
logger = get_logger("ClientPublic")

# 설치 파일 이름 두 가지: npm run dist 가 만드는 이름, publish-release 가 쓰는 이름
SETUP_NAMES = (
    re.compile(r"^BENCH-ERP_Setup_(\d{1,4})\.(\d{1,4})\.(\d{1,5})\.exe$"),
    re.compile(r"^BENCH-ERP_V\.(\d{1,4})\.(\d{2})\.(\d{3})_Setup\.exe$"),
)


class PublicReleaseOut(BaseModel):
    version: str  # 내부 표기 0.70.171
    display: str  # 화면 표기 V.0.70.171
    filename: str
    size: int
    sha256: str  # 파일 내용의 SHA-256 (앱이 받은 파일이 손상되지 않았는지 확인할 때 쓴다)


_hash_cache: dict[tuple[str, int, float], str] = {}


def _file_sha256(path: Path, size: int) -> str:
    """설치 파일의 SHA-256. 파일이 바뀌지 않았으면(이름·크기·수정 시각이 같으면) 다시 계산하지 않는다."""
    key = (str(path), size, path.stat().st_mtime)
    cached = _hash_cache.get(key)
    if cached:
        return cached
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    _hash_cache.clear()  # 최신 파일 하나만 기억한다
    _hash_cache[key] = digest.hexdigest()
    return _hash_cache[key]


def _release_dirs() -> list[Path]:
    configured = settings.client_public_release_dirs.strip()
    if configured:
        return [Path(p.strip()) for p in configured.split(";") if p.strip()]
    root = Path(__file__).resolve().parents[3]  # 프로젝트 루트 (backend/app/routers 에서 세 단계 위)
    return [root / "release", root / "desktop" / "release"]


def _find_public_release() -> tuple[PublicReleaseOut, Path] | None:
    """폴더들을 훑어 가장 높은 버전의 설치 파일. 없으면 None."""
    best: tuple[tuple[int, int, int], Path, int] | None = None
    for directory in _release_dirs():
        try:
            entries = list(os.scandir(directory))
        except OSError:
            continue
        for entry in entries:
            try:
                # 폴더나 바로가기(심볼릭 링크)가 아닌 일반 파일만
                if not entry.is_file(follow_symlinks=False):
                    continue
                size = entry.stat(follow_symlinks=False).st_size
            except OSError:
                continue
            if size <= 0:
                continue
            for pattern in SETUP_NAMES:
                m = pattern.match(entry.name)
                if m:
                    version = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
                    if best is None or version > best[0]:
                        best = (version, Path(entry.path), size)
                    break
    if best is None:
        return None
    version, path, size = best
    internal = f"{version[0]}.{version[1]}.{version[2]}"
    release = PublicReleaseOut(version=internal, display=format_version(internal), filename=path.name, size=size, sha256=_file_sha256(path, size))
    return release, path


@router.get("/latest", response_model=PublicReleaseOut | None)
def public_latest():
    """내려받을 수 있는 최신 설치 파일 정보. 놓인 파일이 없으면 null (화면에서는 링크를 숨긴다)."""
    found = _find_public_release()
    logger.debug(f"[ClientPublic] 최신 설치 파일 조회: {found[0].display if found else '없음'}")
    return found[0] if found else None


@router.get("/download")
def public_download(request: Request):
    found = _find_public_release()
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="내려받을 설치 파일이 아직 올라와 있지 않습니다. 관리자에게 문의하세요.")
    release, path = found
    logger.info(f"[ClientPublic] 설치 파일 내려받기: {release.display}, 접속 주소={request.client.host if request.client else '알 수 없음'}")
    return FileResponse(path, media_type="application/octet-stream", filename=release.filename, content_disposition_type="attachment")
