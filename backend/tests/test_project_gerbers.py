"""프로젝트 거버: zip·여러 파일 등록, 버전(Rev) 자동 증가, 목록·받기·삭제, 잘못된 파일 거절."""
import io
import zipfile

from app.config import settings
from app.models.project import Project
from app.models.user import UserRole


def _project(db, make_client, user) -> Project:
    client = make_client()
    project = Project(name="거버 테스트 프로젝트", client_id=client.id, created_by=user.id)
    db.add(project)
    db.flush()
    return project


def _zip_bytes(names):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for n in names:
            zf.writestr(n, "G04 test*\nM02*\n")
    return buf.getvalue()


def test_upload_zip_and_multiple_files_make_revisions(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "project_gerbers_dir", str(tmp_path))
    me = make_user(role=UserRole.employee, name="김민수")
    h = auth_headers(me)
    p = _project(db, make_client, me)
    url = f"/api/projects/{p.id}/gerbers"
    assert client.get(url, headers=h).json() == []

    res = client.post(url, headers=h, files=[("files", ("board.zip", _zip_bytes(["top.gtl", "bottom.gbl", "drill.drl"]), "application/zip"))], data={"note": " 첫 시제 "})
    assert res.status_code == 201, res.text
    rows = res.json()
    assert len(rows) == 1 and rows[0]["revision"] == "Rev A" and rows[0]["is_latest"] is True
    assert rows[0]["layer_names"] == ["bottom.gbl", "drill.drl", "top.gtl"] and rows[0]["note"] == "첫 시제" and rows[0]["uploaded_by"] == "김민수"

    # 거버 파일 여러 개를 올리면 서버가 zip 한 벌로 묶는다
    res2 = client.post(url, headers=h, files=[("files", ("a.gtl", b"G04*\nM02*\n", "text/plain")), ("files", ("a.gko", b"G04*\nM02*\n", "text/plain"))])
    assert res2.status_code == 201, res2.text
    rows = res2.json()
    assert [r["revision"] for r in rows] == ["Rev B", "Rev A"] and rows[0]["is_latest"] is True and rows[1]["is_latest"] is False
    assert rows[0]["layer_names"] == ["a.gko", "a.gtl"] and rows[0]["filename"].endswith(".zip")

    dl = client.get(f"{url}/{rows[0]['id']}/file", headers=h)
    assert dl.status_code == 200 and dl.headers["content-type"] == "application/zip"
    assert sorted(zipfile.ZipFile(io.BytesIO(dl.content)).namelist()) == ["a.gko", "a.gtl"]


def test_rejects_bad_uploads_and_deletes(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "project_gerbers_dir", str(tmp_path))
    me = make_user(role=UserRole.employee)
    h = auth_headers(me)
    p = _project(db, make_client, me)
    url = f"/api/projects/{p.id}/gerbers"

    bad = client.post(url, headers=h, files=[("files", ("x.zip", b"PK\x03\x04not really a zip", "application/zip"))])
    assert bad.status_code == 400
    empty = client.post(url, headers=h, files=[("files", ("a.gtl", b"", "text/plain"))])
    assert empty.status_code == 400
    dup = client.post(url, headers=h, files=[("files", ("a.gtl", b"x", "text/plain")), ("files", ("a.gtl", b"y", "text/plain"))])
    assert dup.status_code == 400
    assert client.post("/api/projects/999999/gerbers", headers=h, files=[("files", ("a.gtl", b"x", "text/plain"))]).status_code == 404
    assert client.get(url, headers=h).json() == []

    ok = client.post(url, headers=h, files=[("files", ("a.zip", _zip_bytes(["a.gtl"]), "application/zip"))]).json()
    gid = ok[0]["id"]
    assert client.get(f"{url}/{gid}/file", headers=h).status_code == 200
    assert client.get(f"/api/projects/{p.id + 1}/gerbers/{gid}/file", headers=h).status_code == 404  # 다른 프로젝트 주소로는 못 받는다
    assert client.delete(f"{url}/{gid}", headers=h).json() == []
    assert client.get(f"{url}/{gid}/file", headers=h).status_code == 404
    assert list(tmp_path.iterdir()) == []  # 저장 파일도 지워진다
