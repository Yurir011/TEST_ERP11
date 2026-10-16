"""
users.title의 Postgres enum 타입(jobtitle)에 'dept_head'(부서장) 값을 추가하는 1회성 마이그레이션 스크립트.
Python Enum(JobTitle)에 dept_head를 추가한 것만으로는 기존 DB의 enum 타입이 갱신되지 않으므로 별도 실행이 필요하다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.add_dept_head_title
"""
from sqlalchemy import text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("AddDeptHeadTitle")


def main():
    with engine.begin() as conn:
        conn.execute(text("ALTER TYPE jobtitle ADD VALUE IF NOT EXISTS 'dept_head'"))
        logger.debug("[AddDeptHeadTitle] jobtitle enum에 dept_head 값 추가")
    print("마이그레이션 완료: jobtitle enum에 dept_head 값 추가")


if __name__ == "__main__":
    main()
