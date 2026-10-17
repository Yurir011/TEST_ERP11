"""데스크톱 앱 배포 API: 최신 버전 정보와 설치 파일 내려받기."""
import json

import pytest

from app.config import settings

NAME = "BENCH-ERP_V.0.07.150_Setup.exe"
BODY = b"MZ" + b"\x00" * 200


@pytest.fixture(autouse=True)
def releases_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "client_releases_dir", str(tmp_path))
    return tmp_path


def publish(directory, *, filename=NAME, version="0.7.150", body=BODY, notes="NFC 로그인과 메신저", write_file=True, extra=None):
    if write_file:
        (directory / filename).write_bytes(body)
    data = {"version": version, "display": "V.0.07.150", "filename": filename, "size": 999999, "notes": notes, "published_at": "2026-10-17T00:00:00Z", **(extra or {})}
    (directory / "latest.json").write_text(json.dumps(data), encoding="utf-8")


def get_latest(client, user, auth_headers):
    return client.get("/api/client/latest", headers=auth_headers(user))


def test_nothing_published_yet(client, make_user, auth_headers):
    user = make_user()
    r = get_latest(client, user, auth_headers)
    assert r.status_code == 200 and r.json() is None
    assert client.get("/api/client/download", headers=auth_headers(user)).status_code == 404


def test_latest_reports_version_in_both_notations_and_real_size(client, releases_dir, make_user, auth_headers):
    publish(releases_dir)
    r = get_latest(client, make_user(), auth_headers).json()
    assert r["version"] == "0.7.150" and r["display"] == "V.0.07.150"
    assert r["filename"] == NAME and r["notes"] == "NFC 로그인과 메신저"
    assert r["size"] == len(BODY)  # latest.json 에 적힌 값(999999)이 아니라 실제 파일 크기


def test_download_returns_the_installer_as_attachment(client, releases_dir, make_user, auth_headers):
    publish(releases_dir)
    r = client.get("/api/client/download", headers=auth_headers(make_user()))
    assert r.status_code == 200 and r.content == BODY
    assert r.headers["content-disposition"].startswith("attachment")
    assert NAME in r.headers["content-disposition"]


def test_login_is_required(client, releases_dir):
    publish(releases_dir)
    assert client.get("/api/client/latest").status_code == 401
    assert client.get("/api/client/download").status_code == 401


def test_every_role_can_check_for_updates(client, releases_dir, make_user, auth_headers):
    from app.models.user import UserRole

    publish(releases_dir)
    for role in (UserRole.employee, UserRole.admin, UserRole.site_admin):
        assert get_latest(client, make_user(role=role), auth_headers).json()["display"] == "V.0.07.150"


@pytest.mark.parametrize(
    "filename",
    [
        "../secret.exe",  # 폴더를 벗어나려는 이름
        "..\\secret.exe",
        "/etc/passwd",
        "C:\\Windows\\system32\\cmd.exe",
        "sub/BENCH-ERP_V.0.07.150_Setup.exe",
        "BENCH-ERP_V.0.07.150_Setup.exe.bak",
        "setup.exe",
        "BENCH-ERP_V.0.7.150_Setup.exe",  # 표기 형식이 다르다
        "",
    ],
)
def test_unsafe_or_wrong_file_names_are_never_served(client, releases_dir, make_user, auth_headers, filename):
    (releases_dir.parent / "secret.exe").write_bytes(b"secret")
    publish(releases_dir, filename=filename, write_file=False)
    user = make_user()
    assert get_latest(client, user, auth_headers).json() is None
    r = client.get("/api/client/download", headers=auth_headers(user))
    assert r.status_code == 404 and b"secret" not in r.content


def test_version_in_file_name_must_match_latest_json(client, releases_dir, make_user, auth_headers):
    publish(releases_dir, version="0.7.151")  # 파일 이름은 150, 정보는 151
    assert get_latest(client, make_user(), auth_headers).json() is None


@pytest.mark.parametrize("version", ["latest", "", "1.2", "V.0.100.1"])
def test_unparsable_version_is_ignored(client, releases_dir, make_user, auth_headers, version):
    publish(releases_dir, version=version)
    assert get_latest(client, make_user(), auth_headers).json() is None


def test_missing_installer_file_means_nothing_to_offer(client, releases_dir, make_user, auth_headers):
    publish(releases_dir, write_file=False)
    user = make_user()
    assert get_latest(client, user, auth_headers).json() is None
    assert client.get("/api/client/download", headers=auth_headers(user)).status_code == 404


@pytest.mark.parametrize("content", ["{not json", "[]", "null", '"text"'])
def test_broken_latest_json_is_ignored(client, releases_dir, make_user, auth_headers, content):
    (releases_dir / NAME).write_bytes(BODY)
    (releases_dir / "latest.json").write_text(content, encoding="utf-8")
    assert get_latest(client, make_user(), auth_headers).json() is None


def test_missing_optional_fields_are_tolerated(client, releases_dir, make_user, auth_headers):
    (releases_dir / NAME).write_bytes(BODY)
    (releases_dir / "latest.json").write_text(json.dumps({"version": "0.7.150", "filename": NAME}), encoding="utf-8")
    r = get_latest(client, make_user(), auth_headers).json()
    assert r["notes"] == "" and r["published_at"] is None and r["display"] == "V.0.07.150"


def test_newer_release_replaces_the_announcement(client, releases_dir, make_user, auth_headers):
    publish(releases_dir)
    new_name = "BENCH-ERP_V.0.07.151_Setup.exe"
    publish(releases_dir, filename=new_name, version="0.7.151", body=BODY + b"new")
    r = get_latest(client, make_user(), auth_headers).json()
    assert r["display"] == "V.0.07.151" and r["size"] == len(BODY) + 3
    assert (releases_dir / NAME).exists()  # 이전 파일은 그대로 남아 있다 (되돌릴 수 있게)


def test_a_real_file_outside_the_release_folder_cannot_be_reached_with_dotdot(client, releases_dir, make_user, auth_headers):
    """상위 폴더에 같은 이름의 진짜 파일이 있어도 ../ 이름으로는 내려받을 수 없다 (이름 형식 검사가 막는다)."""
    outside = releases_dir.parent / NAME
    outside.write_bytes(b"outside-secret")
    try:
        publish(releases_dir, filename="../" + NAME, write_file=False)
        user = make_user()
        assert get_latest(client, user, auth_headers).json() is None
        r = client.get("/api/client/download", headers=auth_headers(user))
        assert r.status_code == 404 and b"outside-secret" not in r.content
    finally:
        outside.unlink()
