

def test_my_theme_is_saved_per_account(client, make_user, auth_headers):
    a, b = make_user(name="직원A"), make_user(name="직원B")
    ha, hb = auth_headers(a), auth_headers(b)
    assert client.get("/api/auth/me", headers=ha).json()["ui_theme"] is None
    assert client.put("/api/auth/me/theme", headers=ha, json={"theme": "midnight"}).status_code == 204
    assert client.get("/api/auth/me", headers=ha).json()["ui_theme"] == "midnight"
    assert client.get("/api/auth/me", headers=hb).json()["ui_theme"] is None  # 다른 직원은 그대로
    assert client.put("/api/auth/me/theme", headers=ha, json={"theme": "nope"}).status_code == 422
    assert client.put("/api/auth/me/theme", headers=ha, json={"theme": "classic"}).status_code == 204  # 기본으로 되돌리면 비운다
    assert client.get("/api/auth/me", headers=ha).json()["ui_theme"] is None
