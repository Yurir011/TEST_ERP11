"""CORS 설정 테스트: 허용 주소·메서드·헤더만 열려 있는지."""

ALLOWED = "http://localhost:5173"


def _preflight(client, origin, method="GET", headers="authorization,content-type"):
    return client.options(
        "/api/health",
        headers={"Origin": origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers},
    )


def test_allowed_origin_preflight(client):
    res = _preflight(client, ALLOWED, "PUT")
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == ALLOWED
    allowed_methods = res.headers["access-control-allow-methods"]
    for m in ("GET", "POST", "PUT", "DELETE"):
        assert m in allowed_methods


def test_unknown_origin_is_not_allowed(client):
    res = _preflight(client, "http://evil.example.com")
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


def test_unused_method_is_not_allowed(client):
    assert _preflight(client, ALLOWED, "PATCH").status_code == 400


def test_unlisted_header_is_not_allowed(client):
    assert _preflight(client, ALLOWED, "GET", "x-custom-header").status_code == 400


def test_credentials_are_not_allowed(client):
    res = _preflight(client, ALLOWED)
    assert res.headers.get("access-control-allow-credentials") != "true"


def test_same_origin_requests_are_unaffected(client):
    # 프록시를 거친 같은 주소 요청(Origin 헤더 없음)은 CORS 와 무관하게 동작한다
    assert client.get("/api/health").status_code == 200


def test_proxied_request_with_other_origin_header_is_still_processed(client, make_user):
    # Vite 프록시/Nginx 는 브라우저의 Origin 헤더(예: 사무실 다른 PC 주소)를 그대로 넘긴다.
    # 같은 주소 요청이라 브라우저가 사전 요청(preflight)을 보내지 않으므로, 허용 목록에 없어도 요청 자체는 처리되어야 한다.
    user = make_user()
    res = client.post(
        "/api/auth/login",
        headers={"Origin": "http://192.168.0.10:5173"},
        json={"email": user.email, "password": "pw-for-test"},
    )
    assert res.status_code == 200
