"""시스템 버전. 화면 표기는 V.주.부(2자리).빌드(3자리) (예: V.0.07.150), 내부 표기는 0 을 붙이지 않는 0.7.150 이다.

버전을 올릴 때는 desktop/package.json, frontend/package.json 과 이 파일을 함께 바꾼다
(`cd desktop && npx tsx scripts/bump-version.ts V.0.07.151` 이 세 곳을 한 번에 바꾼다). 어긋나면 tests/test_version.py 가 실패한다.
규칙 문서: docs/version-policy.md
"""
import re

APP_VERSION = "0.72.7"

_PATTERN = re.compile(r"^\s*[vV]?\.?(\d+)\.(\d{1,2})\.(\d{1,3})\s*$")


def parse_version(text: str) -> tuple[int, int, int] | None:
    """"V.0.07.150", "0.07.150", "0.7.150" 모두 받는다. 형식이 틀리면 None."""
    m = _PATTERN.match(text or "")
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def format_version(text: str) -> str:
    """화면 표기: V.0.07.150 (해석할 수 없으면 받은 값 그대로)."""
    v = parse_version(text)
    return f"V.{v[0]}.{v[1]:02d}.{v[2]:03d}" if v else text


def is_newer(candidate: str, current: str) -> bool:
    a, b = parse_version(candidate), parse_version(current)
    return a is not None and b is not None and a > b
