import enum
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    employee = "employee"
    site_admin = "site_admin"  # 사이트 관리자 (대시보드/일정관리/공지사항/설정만 접근하는 별도 계정)


class JobGrade(str, enum.Enum):
    """직급"""

    staff = "staff"  # 사원
    assistant_manager = "assistant_manager"  # 대리
    manager = "manager"  # 과장
    director = "director"  # 이사
    chief = "chief"  # 소장


class JobTitle(str, enum.Enum):
    """직책"""

    ceo = "ceo"  # 대표
    team_lead = "team_lead"  # 팀장


def resolve_role(title: JobTitle | None) -> UserRole:
    """직책에 따라 시스템 권한을 자동으로 결정한다 (대표 -> 관리자, 그 외 -> 일반직원)."""
    return UserRole.admin if title == JobTitle.ceo else UserRole.employee


def is_admin_role(role: UserRole) -> bool:
    """대표(admin)와 사이트 관리자(site_admin) 모두 관리자 권한이 필요한 화면에 접근할 수 있다."""
    return role in (UserRole.admin, UserRole.site_admin)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_no: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.employee)
    grade: Mapped[JobGrade] = mapped_column(Enum(JobGrade, name="jobgrade"), default=JobGrade.staff)
    title: Mapped[JobTitle | None] = mapped_column(Enum(JobTitle, name="jobtitle"), nullable=True)
    hire_date: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
