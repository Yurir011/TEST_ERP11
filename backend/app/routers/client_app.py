"""데스크톱 앱 배포: 서버가 최신 버전 정보를 알려 주고 설치 파일을 내려준다.

관리자가 `desktop` 폴더에서 `npm run publish-release` 를 실행하면 설치 파일(BENCH-ERP_V.0.07.150_Setup.exe)과 latest.json 이
settings.client_releases_dir 에 놓인다. 직원 PC 의 앱은 로그인한 뒤 /latest 로 최신 버전을 확인하고, 더 새 버전이면 안내와
[다운로드] 버튼을 보여 준다. 설치는 직원이 내려받은 파일을 실행해서 한다 (자동으로 바꿔치기하지 않는다).

보안: 로그인한 직원만 받을 수 있고, latest.json 의 파일 이름은 폴더 이름이나 경로가 아닌 정해진 형식의 이름만 인정한다
(파일 이름에 ../ 등을 넣어 다른 파일을 내려받게 하는 것을 막는다).
"""
import json
import os
import re

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.core.deps import get_current_user
from app.logging_config import get_logger
from app.models.user import User
from app.version import format_version, parse_version

router = APIRouter(prefix="/api/client", tags=["client-app"])
logger = get_logger("ClientApp")

INSTALLER_NAME = re.compile(r"^BENCH-ERP_V\.(\d+)\.(\d{2})\.(\d{3})_Setup\.exe$")


class ClientReleaseOut(BaseModel):
    version: str  # 내부 표기 0.7.150
    display: str  # 화면 표기 V.0.07.150
    filename: str
    size: int
    notes: str
    published_at: str | None


def _find_release() -> tuple[ClientReleaseOut, str] | None:
    """올라가 있는 최신 설치 파일 정보와 그 파일 경로. 없거나 형식이 이상하면 None."""
    directory = settings.client_releases_dir
    try:
        with open(os.path.join(directory, "latest.json"), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    filename = data.get("filename")
    version_text = data.get("version")
    if not isinstance(filename, str) or not isinstance(version_text, str):
        return None
    m = INSTALLER_NAME.match(filename)  # 정해진 형식의 이름만 (폴더 구분자나 .. 이 들어갈 수 없다)
    parsed = parse_version(version_text)
    if m is None or parsed is None or tuple(int(x) for x in m.groups()) != parsed:
        return None  # 파일 이름의 버전과 latest.json 의 버전이 다르면 믿지 않는다
    path = os.path.join(directory, filename)
    if not os.path.isfile(path):
        return None
    notes = data.get("notes")
    published = data.get("published_at")
    release = ClientReleaseOut(
        version=f"{parsed[0]}.{parsed[1]}.{parsed[2]}",
        display=format_version(version_text),
        filename=filename,
        size=os.path.getsize(path),  # 실제 파일 크기를 쓴다
        notes=notes if isinstance(notes, str) else "",
        published_at=published if isinstance(published, str) else None,
    )
    return release, path


@router.get("/latest", response_model=ClientReleaseOut | None)
def latest_release(current_user: User = Depends(get_current_user)):
    """서버에 올라가 있는 최신 데스크톱 앱 정보. 아직 올린 적이 없으면 null."""
    found = _find_release()
    logger.debug(f"[ClientApp] 최신 버전 조회: user_id={current_user.id}, 결과={found[0].display if found else '없음'}")
    return found[0] if found else None


@router.get("/download")
def download_release(current_user: User = Depends(get_current_user)):
    found = _find_release()
    if found is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="올라와 있는 설치 파일이 없습니다.")
    release, path = found
    logger.info(f"[ClientApp] 설치 파일 다운로드: {release.display}, user_id={current_user.id}")
    return FileResponse(path, media_type="application/octet-stream", filename=release.filename, content_disposition_type="attachment")
