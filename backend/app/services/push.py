"""모바일 푸시(FCM) 발송.

- 서비스 계정 JSON 경로(FCM_CREDENTIALS_PATH)가 비어 있거나 파일이 없으면 푸시는 꺼진다. 알림은 기존처럼 앱 안에서만 보인다.
- 업무 알림(Notification)이 **커밋된 뒤에** 그 수신자의 모든 기기로 보낸다 (커밋 전에 보내면 롤백된 알림이 폰에 뜬다).
  알림을 만드는 코드마다 고치지 않도록 SQLAlchemy 세션 이벤트 한 곳에서 처리한다 (install_notification_hook).
- 푸시 실패는 로그만 남기고 삼킨다. 결재·연차 같은 본 업무를 막으면 안 된다.
- 푸시 본문은 잠금 화면에 보이므로 금액·거래처 같은 민감한 내용을 넣지 않고 "결재 요청이 도착했습니다" 수준으로 보낸다.
"""
import threading
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.logging_config import get_logger
from app.models.device_token import DeviceToken
from app.models.notification import Notification

logger = get_logger("Push")

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_PENDING_KEY = "push_pending"  # session.info: 이번 트랜잭션에서 새로 저장된 알림 (user_id, title, link)

_ready = False


def _short(token: str) -> str:
    return f"{token[:8]}…"


def init_fcm() -> bool:
    """앱 시작 시 한 번 Firebase Admin SDK 를 초기화한다. 설정이 없거나 실패하면 푸시를 끄고 False."""
    global _ready
    path_text = (settings.fcm_credentials_path or "").strip()
    if not path_text:
        logger.info("[Push] FCM 비활성: FCM_CREDENTIALS_PATH 가 비어 있음 (알림은 앱 안에서만 보입니다)")
        return False
    path = Path(path_text)
    if not path.is_absolute():
        path = BACKEND_DIR / path
    if not path.exists():
        logger.warning(f"[Push] FCM 비활성: 서비스 계정 파일을 찾을 수 없음: {path}")
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(path)))
        _ready = True
        logger.info("[Push] FCM 초기화 완료")
        return True
    except Exception as exc:  # noqa: BLE001 - 푸시 설정 문제로 서버가 시작되지 않으면 안 된다
        logger.error(f"[Push] FCM 초기화 실패: {exc}")
        _ready = False
        return False


def is_enabled() -> bool:
    return _ready


def push_text(notification_title: str) -> tuple[str, str]:
    """알림 제목에서 푸시 제목·본문을 만든다. 거래처명 등이 든 원래 제목은 쓰지 않는다."""
    t = notification_title or ""
    if t.endswith("결재 요청"):
        title = "결재 요청이 도착했습니다"
    elif t.endswith("결재 회수"):
        title = "결재 요청이 회수되었습니다"
    elif t.endswith("승인"):
        title = "결재가 승인되었습니다"
    elif t.endswith("반려"):
        title = "결재가 반려되었습니다"
    else:
        title = "새 알림이 도착했습니다"
    return title, "BENCH ERP 앱에서 확인하세요."


def _is_invalid_token(exc: Exception) -> bool:
    """토큰이 더 이상 쓸 수 없는 경우(앱 삭제·만료·다른 프로젝트 토큰)인지."""
    try:
        from firebase_admin import exceptions, messaging

        return isinstance(exc, (messaging.UnregisteredError, messaging.SenderIdMismatchError, exceptions.InvalidArgumentError))
    except Exception:  # noqa: BLE001
        return False


def _send_each(messages: list) -> list[Exception | None]:
    """FCM 으로 메시지를 보내고 메시지마다 오류(없으면 None)를 돌려준다. 시험에서는 이 함수를 대체한다."""
    from firebase_admin import messaging

    response = messaging.send_each(messages)
    return [None if r.success else r.exception for r in response.responses]


def _build_message(row: DeviceToken, title: str, body: str, link: str | None, badge: int | None):
    from firebase_admin import messaging

    data = {"link": link} if link else {}
    apns = messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound="default", badge=badge)))
    return messaging.Message(token=row.token, notification=messaging.Notification(title=title, body=body), data=data, apns=apns)


def _build_badge_message(row: DeviceToken, badge: int):
    """알림창 없이 앱 아이콘 숫자만 바꾸는 푸시 (iOS 는 앱이 읽음 처리해도 아이콘 숫자를 스스로 줄이지 않는다)."""
    from firebase_admin import messaging

    return messaging.Message(token=row.token, apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(badge=badge))))


def send_badge(db: Session, user_id: int, badge: int) -> int:
    """직원의 모든 기기 앱 아이콘 숫자를 badge 로 맞춘다 (0 이면 지운다). 어떤 예외도 밖으로 내보내지 않는다."""
    try:
        if not _ready:
            return 0
        rows = db.query(DeviceToken).filter(DeviceToken.user_id == user_id).all()
        if not rows:
            return 0
        results = _send_each([_build_badge_message(r, badge) for r in rows])
        sent = 0
        for row, err in zip(rows, results):
            if err is None:
                sent += 1
            elif _is_invalid_token(err):
                logger.debug(f"[Push] 무효 토큰 삭제(배지): user_id={user_id}, token={_short(row.token)}")
                db.delete(row)
            else:
                logger.warning(f"[Push] 배지 갱신 실패: user_id={user_id}, token={_short(row.token)}, error={err}")
        db.commit()
        logger.debug(f"[Push] 앱 아이콘 숫자 갱신: user_id={user_id}, badge={badge}, 기기={len(rows)}, 성공={sent}")
        return sent
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[Push] 배지 갱신 중 오류(무시): user_id={user_id}, error={exc}")
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return 0


def _sync_badge(user_id: int) -> None:
    try:
        with SessionLocal() as db:
            send_badge(db, user_id, _badge(db, user_id))
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[Push] 배지 동기화 스레드 오류(무시): {exc}")


def sync_badge_in_background(user_id: int) -> None:
    """알림·메신저를 읽었을 때 호출한다: 남은 안 읽은 수로 이 직원 폰들의 앱 아이콘 숫자를 맞춘다 (읽어도 숫자가 안 없어지는 문제)."""
    if not _ready:
        return
    threading.Thread(target=_sync_badge, args=(user_id,), daemon=True, name="fcm-badge").start()


def send_push(db: Session, user_id: int, title: str, body: str, link: str | None = None, badge: int | None = None) -> int:
    """직원 한 명의 모든 기기로 푸시를 보낸다. 보낸 기기 수를 돌려준다. 어떤 예외도 밖으로 내보내지 않는다."""
    try:
        if not _ready:
            return 0
        rows = db.query(DeviceToken).filter(DeviceToken.user_id == user_id).all()
        if not rows:
            logger.debug(f"[Push] 등록된 기기 없음, 발송 생략: user_id={user_id}")
            return 0
        messages = [_build_message(r, title, body, link, badge) for r in rows]
        results = _send_each(messages)
        sent = 0
        for row, err in zip(rows, results):
            if err is None:
                sent += 1
            elif _is_invalid_token(err):
                logger.debug(f"[Push] 무효 토큰 삭제: user_id={user_id}, token={_short(row.token)}")
                db.delete(row)
            else:
                logger.warning(f"[Push] 발송 실패: user_id={user_id}, token={_short(row.token)}, error={err}")
        db.commit()
        logger.debug(f"[Push] 발송 완료: user_id={user_id}, 기기={len(rows)}, 성공={sent}")
        return sent
    except Exception as exc:  # noqa: BLE001 - 푸시 실패가 본 업무를 막으면 안 된다
        logger.error(f"[Push] 발송 중 오류(무시): user_id={user_id}, error={exc}")
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return 0


def _unread_count(db: Session, user_id: int) -> int:
    return db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read.is_(False)).count()


def _badge(db: Session, user_id: int) -> int:
    """앱 아이콘에 붙는 숫자: 안 읽은 업무 알림 + 안 읽은 메신저 메시지."""
    from app.services import messenger as messenger_svc  # 순환 import 를 피하려고 여기서 불러온다

    return _unread_count(db, user_id) + messenger_svc.total_unread(db, user_id)


def _deliver(items: list[tuple[int, str, str | None]]) -> None:
    """커밋된 알림들을 보낸다 (백그라운드 스레드에서 실행)."""
    try:
        with SessionLocal() as db:
            for user_id, notification_title, link in items:
                title, body = push_text(notification_title)
                send_push(db, user_id, title, body, link, badge=_badge(db, user_id))
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[Push] 알림 발송 스레드 오류(무시): {exc}")


def _deliver_ready(items: list[tuple[int, str, str, str | None]]) -> None:
    """제목·본문이 이미 정해진 푸시들을 보낸다 (백그라운드 스레드에서 실행)."""
    try:
        with SessionLocal() as db:
            for user_id, title, body, link in items:
                send_push(db, user_id, title, body, link, badge=_badge(db, user_id))
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[Push] 메시지 발송 스레드 오류(무시): {exc}")


def notify_new_message(db: Session, message_id: int, conversation_id: int) -> None:
    """메신저 새 메시지를 받는 사람들의 폰으로 푸시한다. 보낸 사람, 알림을 끈(muted) 사람, 지금 실시간 연결로 보고 있는 사람은 뺀다.
    메신저는 Notification 을 만들지 않으므로 메시지를 저장한 쪽에서 직접 부른다. 어떤 오류도 밖으로 내보내지 않는다."""
    try:
        if not _ready:
            return
        from app.core.realtime import hub
        from app.models.messenger import Conversation, ConversationMember, Message
        from app.services import messenger as messenger_svc

        m = db.get(Message, message_id)
        conv = db.get(Conversation, conversation_id)
        if m is None or conv is None or m.sender_id is None:
            return
        sender = m.sender
        sender_name = sender.name if sender else "알 수 없음"
        members = db.query(ConversationMember).filter(ConversationMember.conversation_id == conversation_id, ConversationMember.left_at.is_(None)).all()
        targets = [x.user_id for x in members if x.user_id != m.sender_id and not x.muted and not hub.is_online(x.user_id)]
        if not targets:
            logger.debug(f"[Push] 메시지 푸시 대상 없음: conversation_id={conversation_id}, message_id={message_id}")
            return
        preview = messenger_svc._preview(m) if settings.fcm_messenger_preview else "새 메시지가 도착했습니다"
        if conv.kind == "group":
            title, body = (conv.title or "그룹 대화"), f"{sender_name}: {preview}"
        else:
            title, body = sender_name, preview
        link = f"/m/messenger/{conversation_id}"
        send_ready_in_background([(uid, title, body, link) for uid in targets])
    except Exception as exc:  # noqa: BLE001 - 푸시 실패가 메시지 전송을 막으면 안 된다
        logger.error(f"[Push] 메시지 푸시 준비 중 오류(무시): {exc}")


def send_ready_in_background(items: list[tuple[int, str, str, str | None]]) -> None:
    if not items or not _ready:
        return
    logger.debug(f"[Push] 메신저 푸시 {len(items)}건 발송 시작")
    threading.Thread(target=_deliver_ready, args=(items,), daemon=True, name="fcm-push-msg").start()


def send_in_background(items: list[tuple[int, str, str | None]]) -> None:
    """네트워크를 기다리지 않도록 별도 스레드로 보낸다."""
    if not items or not _ready:
        return
    logger.debug(f"[Push] 커밋된 알림 {len(items)}건 발송 시작")
    threading.Thread(target=_deliver, args=(items,), daemon=True, name="fcm-push").start()


_hook_installed = False


def install_notification_hook() -> None:
    """Notification 이 저장되고 **커밋되면** 수신자 폰으로 푸시를 보낸다 (롤백되면 보내지 않는다)."""
    global _hook_installed
    if _hook_installed:
        return
    _hook_installed = True

    @event.listens_for(Session, "after_flush")
    def _collect(session: Session, _ctx) -> None:
        for obj in session.new:
            if isinstance(obj, Notification):
                session.info.setdefault(_PENDING_KEY, []).append((obj.user_id, obj.title, obj.link))

    @event.listens_for(Session, "after_commit")
    def _send(session: Session) -> None:
        items = session.info.pop(_PENDING_KEY, None)
        if items:
            send_in_background(items)

    @event.listens_for(Session, "after_rollback")
    def _discard(session: Session) -> None:
        session.info.pop(_PENDING_KEY, None)
