"""
최초 관리자 계정을 생성하는 스크립트.
사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.create_admin
  (인자 없이 실행하면 대화식으로 입력받는다)

  또는 인자로 직접 전달:
  venv\\Scripts\\python.exe -m app.scripts.create_admin --employee-no 1000 --email admin@erp.local --name 관리자 --password admin1234
"""
import argparse
import getpass
from datetime import date

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.logging_config import get_logger, setup_logging
from app.models.user import User, UserRole

setup_logging()
logger = get_logger("CreateAdmin")


def main():
    parser = argparse.ArgumentParser(description="최초 관리자 계정 생성")
    parser.add_argument("--employee-no")
    parser.add_argument("--email")
    parser.add_argument("--name")
    parser.add_argument("--password")
    parser.add_argument("--hire-date", help="YYYY-MM-DD (미입력 시 오늘 날짜)")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("=== 관리자 계정 생성 ===")
        employee_no = args.employee_no or input("사번: ").strip()
        email = args.email or input("이메일: ").strip()
        name = args.name or input("이름: ").strip()
        password = args.password or getpass.getpass("비밀번호: ")

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"이미 존재하는 이메일입니다: {email}")
            return

        user = User(
            employee_no=employee_no,
            email=email,
            name=name,
            hashed_password=hash_password(password),
            role=UserRole.admin,
            hire_date=date.fromisoformat(args.hire_date) if args.hire_date else date.today(),
        )
        db.add(user)
        db.commit()
        logger.debug(f"[CreateAdmin] 관리자 계정 생성 완료: email={email}")
        print(f"관리자 계정이 생성되었습니다: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
