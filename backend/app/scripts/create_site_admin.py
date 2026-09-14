"""
사이트 관리자(site_admin) 계정을 생성하는 스크립트.
일반 직원 계정(대표/팀장/사원 등)과 달리 대시보드·일정관리·공지사항·설정 메뉴만 사용하는 별도 계정이며,
role이 직책으로부터 자동 계산되지 않고 이 스크립트에서 직접 site_admin으로 지정된다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.create_site_admin
  (인자 없이 실행하면 대화식으로 입력받는다)

  또는 인자로 직접 전달:
  venv\\Scripts\\python.exe -m app.scripts.create_site_admin --employee-no SITE01 --email siteadmin@erp.local --name 사이트관리자 --password 1234
"""
import argparse
import getpass
from datetime import date

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.logging_config import get_logger, setup_logging
from app.models.user import JobGrade, User, UserRole

setup_logging()
logger = get_logger("CreateSiteAdmin")


def main():
    parser = argparse.ArgumentParser(description="사이트 관리자 계정 생성")
    parser.add_argument("--employee-no")
    parser.add_argument("--email")
    parser.add_argument("--name")
    parser.add_argument("--password")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("=== 사이트 관리자 계정 생성 ===")
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
            role=UserRole.site_admin,
            grade=JobGrade.staff,
            title=None,
            hire_date=date.today(),
        )
        db.add(user)
        db.commit()
        logger.debug(f"[CreateSiteAdmin] 사이트 관리자 계정 생성 완료: email={email}")
        print(f"사이트 관리자 계정이 생성되었습니다: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
