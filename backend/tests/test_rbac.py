"""권한 판정(core/deps.py, models/user.py) 특성화 테스트."""
import pytest

from app.models.user import JobTitle, UserRole, has_menu_permission, is_admin_role, is_dept_head_or_above


# ── 순수 판정 함수 ────────────────────────────────────────────────

def test_admin_role_helper(make_user):
    assert is_admin_role(UserRole.admin)
    assert is_admin_role(UserRole.site_admin)
    assert not is_admin_role(UserRole.employee)


def test_menu_permission_matrix(make_user):
    admin = make_user(role=UserRole.admin)
    site_admin = make_user(role=UserRole.site_admin, menu_permissions=["payments"])
    granted = make_user(menu_permissions=["payments", "clients"])
    plain = make_user()

    assert has_menu_permission(admin, "payments")  # 대표는 항상 허용
    assert not has_menu_permission(site_admin, "payments")  # 사이트 관리자는 이 메뉴 대상이 아님
    assert has_menu_permission(granted, "payments")
    assert not has_menu_permission(granted, "transactions")
    assert not has_menu_permission(plain, "payments")


@pytest.mark.parametrize(
    "role, title, expected",
    [
        (UserRole.admin, None, True),  # 대표 권한은 직책과 무관
        (UserRole.employee, JobTitle.dept_head, True),
        (UserRole.employee, JobTitle.team_lead, True),
        (UserRole.employee, JobTitle.ceo, True),
        (UserRole.employee, None, False),
        (UserRole.site_admin, None, False),
    ],
)
def test_dept_head_or_above(make_user, role, title, expected):
    assert is_dept_head_or_above(make_user(role=role, title=title)) is expected


# ── API 수준: 인증/인가 ────────────────────────────────────────────

def test_no_token_is_401(client):
    assert client.get("/api/transactions").status_code == 401


def test_invalid_token_is_401(client):
    res = client.get("/api/transactions", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401


def test_inactive_user_is_401(client, make_user, auth_headers):
    user = make_user(role=UserRole.admin, is_active=False)
    assert client.get("/api/transactions", headers=auth_headers(user)).status_code == 401


def test_menu_protected_endpoint(client, make_user, auth_headers):
    admin = make_user(role=UserRole.admin)
    granted = make_user(menu_permissions=["transactions"])
    plain = make_user()
    site_admin = make_user(role=UserRole.site_admin)

    assert client.get("/api/transactions", headers=auth_headers(admin)).status_code == 200
    assert client.get("/api/transactions", headers=auth_headers(granted)).status_code == 200
    assert client.get("/api/transactions", headers=auth_headers(plain)).status_code == 403
    assert client.get("/api/transactions", headers=auth_headers(site_admin)).status_code == 403


def test_menu_permission_is_per_menu(client, make_user, auth_headers):
    only_payments = make_user(menu_permissions=["payments"])
    assert client.get("/api/payments", headers=auth_headers(only_payments)).status_code == 200
    assert client.get("/api/transactions", headers=auth_headers(only_payments)).status_code == 403


def test_login_wrong_password_is_401(client, make_user):
    user = make_user()
    res = client.post("/api/auth/login", json={"email": user.email, "password": "wrong"})
    assert res.status_code == 401


def test_login_success_returns_token_and_me_works(client, make_user):
    user = make_user()
    res = client.post("/api/auth/login", json={"email": user.email, "password": "pw-for-test"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == user.email


def test_login_inactive_user_is_403(client, make_user):
    user = make_user(is_active=False)
    res = client.post("/api/auth/login", json={"email": user.email, "password": "pw-for-test"})
    assert res.status_code == 403
