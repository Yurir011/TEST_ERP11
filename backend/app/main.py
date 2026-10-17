from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import models  # noqa: F401  (테이블 메타데이터 등록을 위해 import)
from app.config import settings
from app.core.audit import end_request, start_request
from app.core.db_revision import check_db_revision
from app.core.startup_checks import enforce_security_settings
from app.database import SessionLocal, engine
from app.logging_config import get_logger, setup_logging
from app.services.recurring_payment import generate_recurring_payments
from app.routers import (
    attendance,
    audit_logs,
    auth,
    clients,
    devices,
    documents,
    leaves,
    nfc_auth,
    nfc_cards,
    notices,
    notifications,
    payments,
    recurring_payments,
    project_documents,
    project_progress,
    projects,
    proposals,
    sales_documents,
    schedule,
    todos,
    transactions,
    users,
)

setup_logging()
logger = get_logger("Main")

app = FastAPI(title=settings.app_name)

# 감사 로그용: 요청마다 접속 주소와 요청 경로를 담는다 (로그인 사용자는 인증 의존성이 채운다).
@app.middleware("http")
async def audit_context_middleware(request: Request, call_next):
    token = start_request(request.client.host if request.client else None, f"{request.method} {request.url.path}")
    try:
        return await call_next(request)
    finally:
        end_request(token)


# CORS: 허용 주소는 설정(CORS_ORIGINS)으로만 정하고, 실제로 쓰는 메서드·헤더만 연다.
# 인증은 쿠키가 아니라 Authorization 헤더(Bearer 토큰)로 하므로 allow_credentials 는 필요 없다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(nfc_auth.router)
app.include_router(audit_logs.router)
app.include_router(notices.router)
app.include_router(notifications.router)
app.include_router(attendance.router)
app.include_router(leaves.router)
app.include_router(documents.router)
app.include_router(clients.router)
app.include_router(projects.router)
app.include_router(project_documents.router)
app.include_router(proposals.router)
app.include_router(project_progress.router)
app.include_router(sales_documents.router)
app.include_router(transactions.router)
app.include_router(payments.router)
app.include_router(recurring_payments.router)
app.include_router(users.router)
app.include_router(nfc_cards.router)
app.include_router(devices.router)
app.include_router(schedule.router)
app.include_router(todos.router)


@app.on_event("startup")
def on_startup():
    logger.debug(f"[Main] 서버 시작: app_name={settings.app_name}, environment={settings.environment}, log_level={settings.log_level}")
    enforce_security_settings(settings, logger)  # 운영 환경에서 안전하지 않은 설정이면 여기서 시작을 막는다 (아래 try 밖)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.debug("[Main] DB 연결 확인 성공")
    except Exception as exc:
        logger.error(f"[Main] DB 연결 실패: {exc}")
        return

    # DB 구조는 서버가 바꾸지 않는다 (alembic upgrade head 로 미리 맞춘다). 최신이 아니면 운영에서는 시작을 막는다.
    check_db_revision(engine, settings, logger)

    try:
        # 도래한 정기 자동이체를 입출금 내역으로 기록한다 (서버가 꺼져 있던 기간분도 함께 채운다).
        with SessionLocal() as db:
            created = generate_recurring_payments(db)
            logger.debug(f"[Main] 정기 자동이체 기록: {created}건")
    except Exception as exc:
        logger.error(f"[Main] 정기 자동이체 기록 실패: {exc}")


@app.get("/api/health")
def health_check():
    logger.debug("[Health] 헬스체크 요청 수신")
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_ok = False
        logger.error(f"[Health] DB 확인 실패: {exc}")
    return {"status": "ok", "app": settings.app_name, "db": "connected" if db_ok else "disconnected"}
