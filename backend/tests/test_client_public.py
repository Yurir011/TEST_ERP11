"""설치 파일 공개 내려받기(로그인 없이): 로그인 화면·사이드바의 링크가 쓰는 API."""
import hashlib

import pytest

from app.config import settings

BODY = b"MZ" + b"\x00" * 300


@pytest.fixture
def dirs(tmp_path, monkeypatch):
    """release 폴더 두 개(프로젝트 루트용, desktop 용)를 임시 폴더로 바꾼다."""
    a = tmp_path / "release"
    b = tmp_path / "desktop_release"
    a.mkdir()
    b.mkdir()
    monkeypatch.setattr(settings, "client_public_release_dirs", f"{a};{b}")
    return a, b


def put(directory, name, body=BODY):
    (directory / name).write_bytes(body)


def test_nothing_placed_yet_hides_the_link(client, dirs):
    assert client.get("/api/client/public/latest").json() is None
    r = client.get("/api/client/public/download")
    assert r.status_code == 404
    assert "아직" in r.json()["detail"]


def test_missing_folder_is_not_an_error(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "client_public_release_dirs", str(tmp_path / "없는폴더"))
    assert client.get("/api/client/public/latest").json() is None


def test_works_without_login(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.70.171.exe")
    # Authorization 머리글 없이도 정보와 파일을 받는다 (로그인 화면에서 쓰는 주소)
    assert client.get("/api/client/public/latest").status_code == 200
    assert client.get("/api/client/public/download").status_code == 200


def test_latest_reports_both_notations_and_real_size(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.70.171.exe")
    r = client.get("/api/client/public/latest").json()
    assert r == {"version": "0.70.171", "display": "V.0.70.171", "filename": "BENCH-ERP_Setup_0.70.171.exe", "size": len(BODY), "sha256": hashlib.sha256(BODY).hexdigest()}


def test_download_returns_the_installer_as_attachment(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.70.171.exe")
    r = client.get("/api/client/public/download")
    assert r.status_code == 200 and r.content == BODY
    assert r.headers["content-disposition"].startswith("attachment")
    assert "BENCH-ERP_Setup_0.70.171.exe" in r.headers["content-disposition"]


def test_picks_the_highest_version_across_folders_and_name_styles(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.70.150.exe", b"old" * 100)
    put(dirs[0], "BENCH-ERP_V.0.70.162_Setup.exe", b"mid" * 100)
    put(dirs[1], "BENCH-ERP_Setup_0.71.1.exe", b"new" * 100)  # 0.71.001 → 뒤 자리의 0 을 뗀 표기
    r = client.get("/api/client/public/latest").json()
    assert r["version"] == "0.71.1" and r["display"] == "V.0.71.001"
    assert client.get("/api/client/public/download").content == b"new" * 100


def test_version_comparison_is_numeric_not_textual(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.9.5.exe", b"a" * 50)
    put(dirs[0], "BENCH-ERP_Setup_0.70.5.exe", b"b" * 50)  # 글자순이면 "0.9" 가 더 크게 나온다
    assert client.get("/api/client/public/latest").json()["version"] == "0.70.5"


@pytest.mark.parametrize(
    "name",
    [
        "BENCH-ERP_Setup_0.99.999.exe.txt",
        "BENCH-ERP_Setup_0.99.999.exe.bak",
        "evil_Setup_0.99.999.exe",
        "BENCH-ERP_Setup_0.99.exe",
        "BENCH-ERP_Setup_a.b.c.exe",
        "BENCH-ERP_Setup_0.99.999.EXE",
        "..BENCH-ERP_Setup_0.99.999.exe",
        "x BENCH-ERP_Setup_0.99.999.exe",
        "readme.txt",
    ],
)
def test_ignores_files_that_do_not_match_the_installer_name(client, dirs, name):
    put(dirs[0], "BENCH-ERP_Setup_0.70.171.exe")
    put(dirs[0], name)
    assert client.get("/api/client/public/latest").json()["version"] == "0.70.171"


def test_ignores_folders_and_empty_files(client, dirs):
    (dirs[0] / "BENCH-ERP_Setup_0.99.999.exe").mkdir()  # 이름이 같아도 폴더는 건너뛴다
    put(dirs[0], "BENCH-ERP_Setup_0.98.1.exe", b"")  # 비어 있는 파일은 건너뛴다
    assert client.get("/api/client/public/latest").json() is None
    assert client.get("/api/client/public/download").status_code == 404


def test_cannot_choose_the_file_through_the_request(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.70.171.exe")
    secret = dirs[0].parent / "secret.txt"
    secret.write_text("비밀")
    for query in ("?file=../secret.txt", "?filename=../../secret.txt", "?path=C:/Windows/win.ini"):
        r = client.get(f"/api/client/public/download{query}")
        assert r.status_code == 200 and r.content == BODY  # 요청에 든 값은 쓰지 않는다
    assert client.get("/api/client/public/download/../secret.txt").status_code in (404, 405)


def test_default_folders_are_project_release_and_desktop_release(monkeypatch):
    from app.routers import client_public

    monkeypatch.setattr(settings, "client_public_release_dirs", "")
    names = [p.parts[-2:] for p in client_public._release_dirs()]
    assert names[0][-1] == "release" and names[1] == ("desktop", "release")


def test_other_client_endpoints_still_require_login(client, dirs):
    put(dirs[0], "BENCH-ERP_Setup_0.70.171.exe")
    # 공개로 연 것은 이 두 주소뿐이다. 기존 로그인 전용 주소는 그대로 막혀 있다.
    assert client.get("/api/client/latest").status_code == 401
    assert client.get("/api/client/download").status_code == 401


def test_sha256_follows_the_file_content(client, dirs):
    """같은 이름·크기여도 내용이 바뀌면(수정 시각이 달라지면) 해시도 새로 계산한다"""
    import os

    put(dirs[0], "BENCH-ERP_Setup_0.71.6.exe", b"MZ" + b"" * 300)
    first = client.get("/api/client/public/latest").json()["sha256"]
    assert first == hashlib.sha256(b"MZ" + b"" * 300).hexdigest()
    path = dirs[0] / "BENCH-ERP_Setup_0.71.6.exe"
    put(dirs[0], "BENCH-ERP_Setup_0.71.6.exe", b"MZ" + b"" * 300)  # 같은 크기, 다른 내용
    os.utime(path, (1_900_000_000, 1_900_000_000))
    assert client.get("/api/client/public/latest").json()["sha256"] == hashlib.sha256(b"MZ" + b"" * 300).hexdigest()
