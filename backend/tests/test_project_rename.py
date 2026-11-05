"""프로젝트 이름 변경: 공백 정리, 빈 이름·너무 긴 이름 거부, 없는 프로젝트는 404."""


def _create(client, headers, client_id, name="원래 이름"):
    r = client.post("/api/projects", json={"name": name, "client_id": client_id}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


def test_rename_changes_name_and_keeps_other_fields(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처A")
    pid = _create(client, headers, c.id)
    r = client.put(f"/api/projects/{pid}/name", json={"name": "  새   이름  "}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "새 이름"
    assert body["client_name"] == "거래처A"
    assert client.get(f"/api/projects/{pid}", headers=headers).json()["name"] == "새 이름"


def test_rename_rejects_blank_and_too_long(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="거래처B")
    pid = _create(client, headers, c.id)
    assert client.put(f"/api/projects/{pid}/name", json={"name": "   "}, headers=headers).status_code == 422
    assert client.put(f"/api/projects/{pid}/name", json={"name": "가" * 201}, headers=headers).status_code == 422
    assert client.get(f"/api/projects/{pid}", headers=headers).json()["name"] == "원래 이름"


def test_rename_unknown_project_is_404_and_requires_login(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    assert client.put("/api/projects/999999/name", json={"name": "x"}, headers=headers).status_code == 404
    assert client.put("/api/projects/1/name", json={"name": "x"}).status_code == 401
