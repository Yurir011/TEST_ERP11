"""프로젝트 BOM·P&P·KiCad·STEP 파일 버전: 등록(Rev 증가), kind 별 분리, 받기, 삭제."""
from app.config import settings
from app.models.project import Project
from app.models.user import UserRole


def test_versions_per_kind(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "project_files_dir", str(tmp_path))
    me = make_user(role=UserRole.employee, name="김민수")
    h = auth_headers(me)
    c = make_client()
    p = Project(name="파일 테스트", client_id=c.id, created_by=me.id)
    db.add(p)
    db.flush()
    base = f"/api/projects/{p.id}/files"
    assert client.get(f"{base}/bom", headers=h).json() == []
    r = client.post(f"{base}/bom", headers=h, files=[("files", ("bom.xlsx", b"abc", "application/octet-stream"))])
    assert r.status_code == 201 and r.json()[0]["revision"] == "Rev A"
    r = client.post(f"{base}/bom", headers=h, files=[("files", ("bom2.xlsx", b"abcd", "application/octet-stream"))])
    rows = r.json()
    assert [x["revision"] for x in rows] == ["Rev B", "Rev A"] and rows[0]["is_latest"] and rows[0]["uploaded_by"] == "김민수"
    assert client.get(f"{base}/step", headers=h).json() == []  # 다른 종류와 섞이지 않는다
    newest = rows[0]["id"]
    dl = client.get(f"{base}/bom/{newest}/file", headers=h)
    assert dl.status_code == 200 and dl.content == b"abcd"
    assert client.get(f"{base}/xxx", headers=h).status_code == 422
    left = client.delete(f"{base}/bom/{newest}", headers=h).json()
    assert [x["revision"] for x in left] == ["Rev A"]


def test_only_discarded_project_can_be_deleted(client, db, make_user, make_client, auth_headers, tmp_path, monkeypatch):
    from app.models.project import ProjectStatus

    monkeypatch.setattr(settings, "project_files_dir", str(tmp_path))
    admin = make_user(role=UserRole.admin, name="관리자")
    h = auth_headers(admin)
    c = make_client()
    p = Project(name="삭제 테스트", client_id=c.id, created_by=admin.id)
    db.add(p)
    db.flush()
    client.post(f"/api/projects/{p.id}/files/bom", headers=h, files=[("files", ("bom.xlsx", b"abc", "application/octet-stream"))])
    assert client.delete(f"/api/projects/{p.id}", headers=h).status_code == 400  # 폐기 전에는 삭제 불가
    p.status = ProjectStatus.discarded
    db.flush()
    assert client.delete(f"/api/projects/{p.id}", headers=h).status_code == 204
    assert list(tmp_path.iterdir()) == []  # 올려 둔 파일도 지워진다
    assert client.get(f"/api/projects/{p.id}", headers=h).status_code == 404
