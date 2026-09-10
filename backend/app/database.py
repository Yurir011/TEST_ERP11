from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("Database")

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    logger.debug("[Database] 세션 생성")
    try:
        yield db
    finally:
        db.close()
        logger.debug("[Database] 세션 종료")
