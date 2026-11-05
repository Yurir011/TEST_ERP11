"""패스키 등록·로그인용 1회용 확인값(challenge) 보관.

서버가 만든 challenge 를 브라우저가 기기에 서명시켜 돌려보내면, 서버는 "내가 방금 낸 값에 대한 서명인가"를 확인한다.
challenge 는 한 번만 쓸 수 있고 짧게 유효하므로 가로챈 응답을 다시 보내도 통하지 않는다 (재전송 공격 방지).
등록 확인값은 낸 직원에게만, 로그인 확인값은 로그인 용도로만 쓸 수 있다.

주의: 서버 프로세스 메모리에만 있다. 서버를 재시작하면 발급해 둔 값이 사라지지만(화면에서 다시 시도하면 새로 받는다) 안전에는
영향이 없다. nfc_challenges·login_throttle 과 같이 프로세스 하나로 도는 것을 전제로 한 단순한 구현이다.
"""
import secrets
import threading
import time
from typing import Callable, Literal

Purpose = Literal["register", "login"]

MAX_OUTSTANDING = 1000  # 로그인 전에 누구나 받을 수 있는 값이라, 계속 요청해도 메모리가 늘지 않게 하는 상한


class PasskeyChallengeStore:
    def __init__(self, ttl_seconds: float, clock: Callable[[], float] = time.monotonic):
        self._ttl = ttl_seconds
        self._clock = clock
        self._items: dict[str, tuple[Purpose, int | None, bytes, float]] = {}  # id -> (용도, 직원 id, challenge, 만료 시각)
        self._lock = threading.Lock()

    def issue(self, purpose: Purpose, user_id: int | None, challenge: bytes) -> str:
        now = self._clock()
        challenge_id = secrets.token_urlsafe(24)
        with self._lock:
            self._purge(now)
            while len(self._items) >= MAX_OUTSTANDING:  # 가장 오래된 것부터 버린다
                self._items.pop(next(iter(self._items)))
            self._items[challenge_id] = (purpose, user_id, challenge, now + self._ttl)
        return challenge_id

    def consume(self, challenge_id: str, purpose: Purpose, user_id: int | None = None) -> bytes | None:
        """유효한 값이면 challenge 를, 아니면 None. 맞든 틀리든 한 번 꺼내면 지운다 (재사용 불가)."""
        now = self._clock()
        with self._lock:
            item = self._items.pop(challenge_id, None)
        if item is None:
            return None
        item_purpose, item_user, challenge, expires = item
        if item_purpose != purpose or item_user != user_id or expires <= now:
            return None
        return challenge

    def _purge(self, now: float) -> None:
        for key in [k for k, v in self._items.items() if v[3] <= now]:
            del self._items[key]

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def __len__(self) -> int:
        return len(self._items)
