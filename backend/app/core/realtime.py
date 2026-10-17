"""실시간 알림(WebSocket) 연결 관리.

서버가 먼저 알려 주는 통로다: 새 메시지, 읽음 표시, 대화방 변경. 일반 API(동기 함수, 스레드풀에서 실행)가 DB 저장을 마친 뒤
publish() 를 부르면, 그 사용자의 연결이 열려 있는 이벤트 루프에서 메시지를 보낸다.

주의: 연결 목록은 **서버 프로세스 메모리**에만 있다 (로그인 실패 제한과 같은 전제: 프로세스 하나로 운영).
프로세스를 여러 개로 늘리면 PostgreSQL LISTEN/NOTIFY 등으로 바꿔야 한다. 연결이 끊겨 있는 동안 놓친 메시지는
클라이언트가 다시 연결할 때 REST(GET .../messages?after_id=)로 받아 가므로 메시지를 잃지 않는다.
"""
import asyncio
import threading
from dataclasses import dataclass
from typing import Any, Iterable

from fastapi import WebSocket

from app.logging_config import get_logger

logger = get_logger("WS")


@dataclass(eq=False)
class Connection:
    user_id: int
    ws: WebSocket
    loop: asyncio.AbstractEventLoop


class ConnectionHub:
    def __init__(self) -> None:
        self._conns: dict[int, set[Connection]] = {}
        self._lock = threading.Lock()

    def add(self, user_id: int, ws: WebSocket) -> Connection:
        conn = Connection(user_id, ws, asyncio.get_running_loop())
        with self._lock:
            self._conns.setdefault(user_id, set()).add(conn)
        logger.debug(f"[WS] 연결 등록: user_id={user_id}, 연결 {self.count()}개")
        return conn

    def remove(self, conn: Connection) -> None:
        with self._lock:
            group = self._conns.get(conn.user_id)
            if group is not None:
                group.discard(conn)
                if not group:
                    del self._conns[conn.user_id]
        logger.debug(f"[WS] 연결 해제: user_id={conn.user_id}, 연결 {self.count()}개")

    def count(self) -> int:
        with self._lock:
            return sum(len(g) for g in self._conns.values())

    def is_online(self, user_id: int) -> bool:
        with self._lock:
            return bool(self._conns.get(user_id))

    def publish(self, user_ids: Iterable[int], payload: dict[str, Any]) -> None:
        """user_ids 의 모든 연결에 payload 를 보낸다. 어느 스레드에서 불러도 되고, 기다리지 않는다(보내기에 실패한 연결은 정리)."""
        with self._lock:
            targets = [c for uid in set(user_ids) for c in self._conns.get(uid, ())]
        for conn in targets:
            asyncio.run_coroutine_threadsafe(self._send(conn, payload), conn.loop)

    def broadcast(self, payload: dict[str, Any]) -> None:
        """지금 연결된 모든 직원에게 보낸다 (상태 변경처럼 모두가 볼 정보용)."""
        with self._lock:
            targets = [c for group in self._conns.values() for c in group]
        for conn in targets:
            asyncio.run_coroutine_threadsafe(self._send(conn, payload), conn.loop)

    async def _send(self, conn: Connection, payload: dict[str, Any]) -> None:
        try:
            await conn.ws.send_json(payload)
        except Exception as exc:  # noqa: BLE001 - 끊긴 연결은 조용히 정리한다
            logger.debug(f"[WS] 보내기 실패, 연결 정리: user_id={conn.user_id}, {type(exc).__name__}")
            self.remove(conn)


hub = ConnectionHub()
