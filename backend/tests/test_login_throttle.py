"""로그인 시도 제한(core/login_throttle.py, routers/auth.py) 테스트."""
import pytest

from app.core.login_throttle import LoginThrottle, ThrottleRule

EMAIL_RULE = ThrottleRule(max_failures=3, window_seconds=60, lockout_seconds=120)
IP_RULE = ThrottleRule(max_failures=5, window_seconds=60, lockout_seconds=120)


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


@pytest.fixture()
def clock():
    return Clock()


@pytest.fixture()
def throttle(clock):
    return LoginThrottle(EMAIL_RULE, IP_RULE, clock=clock)


# ── 순수 로직 ─────────────────────────────────────────────────────

def test_not_locked_until_limit_reached(throttle):
    for _ in range(2):
        throttle.record_failure("a@x.com", "1.1.1.1")
    assert throttle.retry_after("a@x.com", "1.1.1.1") == 0
    throttle.record_failure("a@x.com", "1.1.1.1")
    assert throttle.retry_after("a@x.com", "1.1.1.1") == 120


def test_lock_expires_after_lockout(throttle, clock):
    for _ in range(3):
        throttle.record_failure("a@x.com", None)
    clock.advance(119)
    assert throttle.retry_after("a@x.com", None) == 1
    clock.advance(2)
    assert throttle.retry_after("a@x.com", None) == 0
    # 잠금이 풀린 뒤에는 처음부터 다시 센다
    throttle.record_failure("a@x.com", None)
    assert throttle.retry_after("a@x.com", None) == 0


def test_old_failures_outside_window_are_not_counted(throttle, clock):
    throttle.record_failure("a@x.com", None)
    throttle.record_failure("a@x.com", None)
    clock.advance(61)  # 기간(60초)이 지나 앞선 실패는 세지 않는다
    throttle.record_failure("a@x.com", None)
    assert throttle.retry_after("a@x.com", None) == 0


def test_email_is_case_and_space_insensitive(throttle):
    for _ in range(3):
        throttle.record_failure("User@X.com ", None)
    assert throttle.retry_after("user@x.com", None) > 0


def test_other_emails_are_not_affected(throttle):
    for _ in range(3):
        throttle.record_failure("a@x.com", "1.1.1.1")
    assert throttle.retry_after("b@x.com", "2.2.2.2") == 0


def test_ip_limit_blocks_many_accounts(throttle):
    for i in range(5):  # 서로 다른 이메일을 한 주소에서 계속 시도
        throttle.record_failure(f"u{i}@x.com", "9.9.9.9")
    assert throttle.retry_after("new@x.com", "9.9.9.9") > 0
    assert throttle.retry_after("new@x.com", "8.8.8.8") == 0  # 다른 주소는 영향 없음


def test_success_clears_email_failures(throttle):
    throttle.record_failure("a@x.com", None)
    throttle.record_failure("a@x.com", None)
    throttle.record_success("a@x.com", None)
    throttle.record_failure("a@x.com", None)
    assert throttle.retry_after("a@x.com", None) == 0


# ── API ───────────────────────────────────────────────────────────

def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_login_is_blocked_after_repeated_failures(client, make_user):
    user = make_user()
    for _ in range(5):
        assert _login(client, user.email, "wrong").status_code == 401
    blocked = _login(client, user.email, "wrong")
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert "다시 시도" in blocked.json()["detail"]


def test_correct_password_is_also_rejected_while_locked(client, make_user):
    user = make_user()
    for _ in range(5):
        _login(client, user.email, "wrong")
    assert _login(client, user.email, "pw-for-test").status_code == 429


def test_unknown_email_is_throttled_the_same_way(client):
    for _ in range(5):
        assert _login(client, "nobody@test.local", "x").status_code == 401
    assert _login(client, "nobody@test.local", "x").status_code == 429  # 존재 여부와 무관하게 같은 동작


def test_success_resets_failure_count(client, make_user):
    user = make_user()
    for _ in range(4):
        assert _login(client, user.email, "wrong").status_code == 401
    assert _login(client, user.email, "pw-for-test").status_code == 200
    for _ in range(4):  # 성공 뒤에는 다시 처음부터 센다
        assert _login(client, user.email, "wrong").status_code == 401
    assert _login(client, user.email, "pw-for-test").status_code == 200


def test_other_user_can_still_log_in_while_one_is_locked(client, make_user):
    locked = make_user()
    other = make_user()
    for _ in range(5):
        _login(client, locked.email, "wrong")
    assert _login(client, locked.email, "pw-for-test").status_code == 429
    assert _login(client, other.email, "pw-for-test").status_code == 200
