"""실시간 알림 WebSocket (/api/ws).

프로토콜 (모두 JSON 글자)
  1. 연결하면 클라이언트가 AUTH_TIMEOUT_SECONDS 안에 {"type": "auth", "token": "<로그인 토큰>"} 을 보낸다.
     토큰을 주소(쿼리)에 넣지 않는다: 서버·프록시 로그에 남기 때문이다. 시간 안에 안 오거나 틀리면 코드 4401 로 끊는다.
  2. 서버가 {"type": "ready"} 를 보내면 준비 완료. 이후 서버가 먼저 보낸다:
       message.created {message}, conversation.read {conversation_id, user_id, message_id}, conversation.updated {conversation_id}
  3. 클라이언트는 30초쯤마다 {"type": "ping"} 을 보낸다 → 서버가 토큰을 다시 확인하고 {"type": "pong"} 으로 답한다.
     그 사이 로그인이 만료됐거나 카드·기기가 중지됐으면 코드 4401 로 끊는다.
받기만 하는 통로다. 보내기·읽음 표시는 REST API 로 한다 (저장 성공 여부를 응답으로 알 수 있고, 권한·감사 규칙을 한곳에서 지킨다).
"""
import asyncio
import json
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from app.core.deps import resolve_user
from app.core.realtime import hub
from app.database import SessionLocal
from app.logging_config import get_logger

router = APIRouter(tags=["messenger"])
logger = get_logger("WS")

AUTH_TIMEOUT_SECONDS = 5.0
MAX_CLIENT_MESSAGE_BYTES = 8192
CLOSE_UNAUTHORIZED = 4401


@contextmanager
def open_session():
    """짧게 쓰는 DB 세션 (연결이 오래 열려 있어도 DB 연결은 확인할 때만 잡는다). 테스트에서 바꿔 끼운다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _authenticate(token: str) -> int | None:
    """토큰이 올바르면 직원 id, 아니면 None."""
    with open_session() as db:
        try:
            return resolve_user(db, token).id
        except HTTPException:
            return None


async def _read_json(ws: WebSocket) -> dict | None:
    text = await ws.receive_text()
    if len(text.encode()) > MAX_CLIENT_MESSAGE_BYTES:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


@router.websocket("/api/ws")
async def realtime(ws: WebSocket):
    await ws.accept()
    try:
        first = await asyncio.wait_for(_read_json(ws), AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        logger.debug("[WS] 인증 메시지가 오지 않아 연결을 끊습니다")
        await _close(ws, CLOSE_UNAUTHORIZED)
        return

    token = first.get("token") if first and first.get("type") == "auth" else None
    user_id = await run_in_threadpool(_authenticate, token) if isinstance(token, str) else None
    if user_id is None:
        logger.warning("[WS] 인증 실패로 연결을 끊습니다")
        await _close(ws, CLOSE_UNAUTHORIZED)
        return

    conn = hub.add(user_id, ws)
    try:
        await ws.send_json({"type": "ready"})
        while True:
            message = await _read_json(ws)
            if message is None:
                await _close(ws, 1003)  # 형식이 틀린 입력
                return
            if message.get("type") == "ping":
                if await run_in_threadpool(_authenticate, token) != user_id:  # 로그인이 만료됐거나 카드·기기가 중지됨
                    logger.info(f"[WS] 로그인이 더 이상 유효하지 않아 연결을 끊습니다: user_id={user_id}")
                    await _close(ws, CLOSE_UNAUTHORIZED)
                    return
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.remove(conn)


async def _close(ws: WebSocket, code: int) -> None:
    try:
        await ws.close(code=code)
    except Exception:  # noqa: BLE001 - 이미 끊긴 연결
        pass
