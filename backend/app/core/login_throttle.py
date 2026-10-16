"""로그인 시도 제한 (무차별 대입 공격 방지).

같은 이메일 또는 같은 접속 주소(IP)에서 짧은 시간에 로그인에 여러 번 실패하면 일정 시간 동안 로그인을 막는다.
- 이메일 기준: 한 계정을 노리는 추측 공격을 막는다.
- IP 기준: 여러 계정을 돌려가며 시도하는 공격을 막는다 (사내망에서 한 PC 를 여럿이 쓰는 경우를 감안해 이메일보다 느슨하게 둔다).

주의사항
- 실패 기록은 **서버 프로세스 메모리**에만 있다. 서버를 재시작하면 초기화되고, 서버를 여러 프로세스로 띄우면 프로세스마다 따로 센다.
  5인 규모의 단일 프로세스 운영을 전제로 한 단순한 구현이며, 규모가 커지면 DB/캐시 기반으로 바꿔야 한다.
- 잠금 여부는 계정 존재 여부와 무관하게 이메일 문자열로만 판단한다 (없는 계정인지 알아내는 데 쓰이지 않게).
- 한 계정이 의도적으로 반복 실패시켜 잠기게 만드는 방해(DoS)는 가능하다. 잠금 시간을 짧게 두어 영향을 줄였다.
"""
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ThrottleRule:
    max_failures: int  # 이 횟수만큼 실패하면 잠근다
    window_seconds: int  # 실패를 세는 기간
    lockout_seconds: int  # 잠금 유지 시간


class LoginThrottle:
    def __init__(self, email_rule: ThrottleRule, ip_rule: ThrottleRule, clock: Callable[[], float] = time.monotonic):
        self._rules = {"email": email_rule, "ip": ip_rule}
        self._clock = clock
        self._failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._locked_until: dict[tuple[str, str], float] = {}

    @staticmethod
    def _keys(email: str, ip: str | None) -> list[tuple[str, str]]:
        keys = [("email", email.strip().lower())]
        if ip:
            keys.append(("ip", ip))
        return keys

    def retry_after(self, email: str, ip: str | None) -> int:
        """잠겨 있으면 다시 시도할 수 있을 때까지 남은 초(올림), 아니면 0."""
        now = self._clock()
        remaining = 0.0
        for key in self._keys(email, ip):
            until = self._locked_until.get(key)
            if until is None:
                continue
            if until <= now:
                del self._locked_until[key]
                self._failures.pop(key, None)
                continue
            remaining = max(remaining, until - now)
        return math.ceil(remaining)

    def record_failure(self, email: str, ip: str | None) -> None:
        now = self._clock()
        for key in self._keys(email, ip):
            rule = self._rules[key[0]]
            window = self._failures[key]
            window.append(now)
            while window and window[0] <= now - rule.window_seconds:
                window.popleft()
            if len(window) >= rule.max_failures:
                self._locked_until[key] = now + rule.lockout_seconds

    def record_success(self, email: str, ip: str | None) -> None:
        """로그인에 성공하면 그 이메일의 실패 기록을 지운다 (IP 기록은 유지: 한 번 성공했다고 다른 계정 추측 시도가 사라지지 않는다)."""
        key = ("email", email.strip().lower())
        self._failures.pop(key, None)
        self._locked_until.pop(key, None)

    def reset(self) -> None:
        self._failures.clear()
        self._locked_until.clear()
