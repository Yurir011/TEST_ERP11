"""프로젝트 생성: 거래처 목록에 없으면 이름을 직접 적어 새로 등록한다."""
from app.models.client import Client


def _create(client, headers, **extra):
    return client.post("/api/projects", json={"name": "직접입력 프로젝트", **extra}, headers=headers)


def test_new_client_name_is_registered(client, db, make_user, auth_headers):
    headers = auth_headers(make_user())
    r = _create(client, headers, client_name="  처음보는통신  ")
    assert r.status_code == 201
    assert r.json()["client_name"] == "처음보는통신"
    created = db.query(Client).filter(Client.name == "처음보는통신").all()
    assert len(created) == 1


def test_same_name_reuses_existing_client(client, db, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    existing = make_client(name="기존거래처")
    r = _create(client, headers, client_name="기존거래처")
    assert r.status_code == 201
    assert db.query(Client).filter(Client.name == "기존거래처").count() == 1
    assert r.json()["client_id"] == existing.id


def test_client_id_still_works_and_nothing_given_is_rejected(client, make_user, make_client, auth_headers):
    headers = auth_headers(make_user())
    c = make_client(name="선택거래처")
    assert _create(client, headers, client_id=c.id).status_code == 201
    assert _create(client, headers).status_code == 422
    assert _create(client, headers, client_name="   ").status_code == 422
