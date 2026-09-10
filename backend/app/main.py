from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import models  # noqa: F401  (테이블 메타데이터 등록을 위해 import)
from app.config import settings
from app.database import Base, engine
from app.logging_config import get_logger, setup_logging
from app.routers import (
    attendance,
    auth,
    clients,
    documents,
    leaves,
    notices,
    payments,
    projects,
    sales_documents,
    schedule,
    todos,
    transactions,
    users,
)

setup_logging()
logger = get_logger("Main")

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(notices.router)
app.include_router(attendance.router)
app.include_router(leaves.router)
app.include_router(documents.router)
app.include_router(clients.router)
app.include_router(projects.router)
app.include_router(sales_documents.router)
app.include_router(transactions.router)
app.include_router(payments.router)
app.include_router(users.router)
app.include_router(schedule.router)
app.include_router(todos.router)


@app.on_event("startup")
def on_startup():
    logger.debug(f"[Main] 서버 시작: app_name={settings.app_name}, log_level={settings.log_level}")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.debug("[Main] DB 연결 확인 성공")
        Base.metadata.create_all(bind=engine)
        logger.debug("[Main] 테이블 생성/확인 완료")
    except Exception as exc:
        logger.error(f"[Main] DB 연결 실패: {exc}")


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
