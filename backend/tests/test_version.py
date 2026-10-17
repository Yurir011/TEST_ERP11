"""시스템 버전 표기·비교, 그리고 앱·화면·서버의 버전이 서로 같은지."""
import json
import re
from pathlib import Path

import pytest

from app.version import APP_VERSION, format_version, is_newer, parse_version

REPO = Path(__file__).resolve().parents[2]


def test_current_version_is_valid_and_shown_in_display_format():
    assert parse_version(APP_VERSION) is not None
    assert re.fullmatch(r"V\.\d+\.\d{2}\.\d{3}", format_version(APP_VERSION))  # 예: V.0.07.150


@pytest.mark.parametrize("text", ["V.0.07.150", "v.0.07.150", "0.07.150", "0.7.150", " V.0.07.150 "])
def test_parse_accepts_both_notations(text):
    assert parse_version(text) == (0, 7, 150)


@pytest.mark.parametrize("text", ["", "abc", "1.2", "1.2.3.4", "V.0.100.1", "V.0.1.1000", "1.2.x"])
def test_parse_rejects_bad_format(text):
    assert parse_version(text) is None


def test_format_pads_minor_and_build():
    assert format_version("1.12.5") == "V.1.12.005"
    assert format_version("0.0.1") == "V.0.00.001"
    assert format_version("개발") == "개발"


def test_compare_is_numeric_not_textual():
    assert is_newer("0.7.151", "V.0.07.150")
    assert is_newer("0.7.100", "0.7.99")
    assert is_newer("0.10.1", "0.9.9")
    assert not is_newer("0.7.150", "V.0.07.150")
    assert not is_newer("latest", "0.7.150")


def test_health_reports_the_display_version(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["version"] == format_version(APP_VERSION)


@pytest.mark.parametrize("relative", ["desktop/package.json", "frontend/package.json"])
def test_all_components_share_the_same_version(relative):
    """버전을 올릴 때 한 곳을 빠뜨리면 여기서 실패한다 (Docker 이미지 안처럼 다른 폴더가 없으면 건너뛴다)."""
    path = REPO / relative
    if not path.exists():
        pytest.skip(f"{relative} 없음")
    assert json.loads(path.read_text(encoding="utf-8"))["version"] == APP_VERSION
