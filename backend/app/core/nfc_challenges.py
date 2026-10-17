"""카드 로그인용 1회용 확인값(nonce) 보관.

기기가 로그인하기 전에 서버에서 nonce 를 받아 (nonce, 카드 번호)에 서명해 보낸다. nonce 는 한 번만 쓸 수 있고 짧게 유효하므로
같은 요청을 가로채 다시 보내도 통하지 않는다 (재전송 공격 방지).

주의: 서버 프로세스 메모리에만 있다. 서버를 재시작하면 발급해 둔 nonce 가 사라지지만(앱이 카드를 다시 대면 새로 받는다) 안전에는
영향이 없다. 로그인 실패 제한(login_throttle)과 같이 프로세스 하나로 도는 것을 전제로 한 단순한 구현이다.
"""
import secrets
import threading
import time
from typing import Callable

MAX_OUTSTANDING = 1000  # 인증 없이 받을 수 있는 승인된 기기가 값을 계속 요청해도 메모리가 늘지 않게 하는 상한


class ChallengeStore:
    def __init__(self, ttl_seconds: float, clock: Callable[[], float] = time.monotonic):
        self._ttl = ttl_seconds
        self._clock = clock
        self._items: dict[str, tuple[str, float]] = {}  # nonce -> (기기 공개키, 만료 시각)
        self._lock = threading.Lock()

    def issue(self, device_key: str) -> str:
        now = self._clock()
        nonce = secrets.token_hex(16)
        with self._lock:
            self._purge(now)
            while len(self._items) >= MAX_OUTSTANDING:  # 가장 오래된 것부터 버린다
                self._items.pop(next(iter(self._items)))
            self._items[nonce] = (device_key, now + self._ttl)
        return nonce

    def consume(self, nonce: str, device_key: str) -> bool:
        """nonce 가 이 기기에 발급된 유효한 값이면 True. 맞든 틀리든 한 번 꺼내면 지운다 (재사용 불가)."""
        now = self._clock()
        with self._lock:
            item = self._items.pop(nonce, None)
        if item is None:
            return False
        owner, expires = item
        return owner == device_key and expires > now

    def _purge(self, now: float) -> None:
        for nonce in [n for n, (_, exp) in self._items.items() if exp <= now]:
            del self._items[nonce]

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def __len__(self) -> int:
        return len(self._items)
