"""프로젝트 파일 버전(V.x.xx.xxx): 등록(최신순), 항목별 파일 올리기, Firmware·GUI 의 bin/src, 이름 변경, 받기, 삭제."""
from app.config import settings
from app.models.project import Project
from app.models.user import UserRole


def _setup(db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "project_files_dir", str(tmp_path))
    me = make_user(role=UserRole.employee, name="김민수")
    c = make_client()
    p = Project(name="릴리스 테스트", client_id=c.id, created_by=me.id)
    db.add(p)
    db.flush()
    return p, auth_headers(me), f"/api/projects/{p.id}/releases"


def test_releases_newest_first_and_unique(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    _, h, base = _setup(db, make_user, make_client, auth_headers, tmp_path, monkeypatch)
    assert client.post(base, headers=h, json={"version": "V.1.00.000", "release_date": "2026-06-10"}).status_code == 201
    assert client.post(base, headers=h, json={"version": "V.1.10.000", "release_date": "2026-08-10"}).status_code == 201
    assert [r["version"] for r in client.get(base, headers=h).json()] == ["V.1.10.000", "V.1.00.000"]
    assert client.post(base, headers=h, json={"version": "V.1.10.000"}).status_code == 409
    assert client.post(base, headers=h, json={"version": "  "}).status_code == 422


def test_files_per_category_and_groups(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    _, h, base = _setup(db, make_user, make_client, auth_headers, tmp_path, monkeypatch)
    rid = client.post(base, headers=h, json={"version": "V.1.10.000"}).json()["id"]
    up = lambda cat, name, group=None: client.post(
        f"{base}/{rid}/files", headers=h, data={"category": cat, **({"group": group} if group else {})}, files=[("files", (name, b"abc", "application/octet-stream"))]
    )
    assert up("bom", "aaa.xlsx").status_code == 201
    assert up("firmware", "fw.bin").status_code == 400  # bin/src 를 골라야 한다
    assert up("firmware", "fw.bin", "bin").status_code == 201
    r = up("firmware", "main.c", "src")
    assert r.status_code == 201
    assert up("nope", "x").status_code == 400
    files = r.json()["files"]
    assert [(f["category"], f["group"], f["filename"]) for f in files] == [("bom", None, "aaa.xlsx"), ("firmware", "bin", "fw.bin"), ("firmware", "src", "main.c")]
    fid = files[0]["id"]
    assert client.get(f"{base}/{rid}/files/{fid}/file", headers=h).content == b"abc"
    renamed = client.put(f"{base}/{rid}/files/{fid}", headers=h, json={"filename": "bbb.xlsx"}).json()
    assert renamed["files"][0]["filename"] == "bbb.xlsx"
    left = client.delete(f"{base}/{rid}/files/{fid}", headers=h).json()
    assert [f["filename"] for f in left["files"]] == ["fw.bin", "main.c"]


def test_update_and_delete_release_removes_files(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    _, h, base = _setup(db, make_user, make_client, auth_headers, tmp_path, monkeypatch)
    rid = client.post(base, headers=h, json={"version": "V.1.00.000"}).json()["id"]
    client.post(f"{base}/{rid}/files", headers=h, data={"category": "step"}, files=[("files", ("a.step", b"abc", "application/octet-stream"))])
    assert len(list(tmp_path.iterdir())) == 1
    edited = client.put(f"{base}/{rid}", headers=h, json={"version": "V.1.01.000", "release_date": "2026-07-01"}).json()
    assert edited["version"] == "V.1.01.000" and edited["release_date"] == "2026-07-01"
    assert client.delete(f"{base}/{rid}", headers=h).status_code == 204
    assert client.get(base, headers=h).json() == [] and list(tmp_path.iterdir()) == []
