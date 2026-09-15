from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import MENU_PERMISSION_KEYS, JobGrade, JobTitle, UserRole

# 사내망 전용 시스템이라 .local 등 예약 도메인도 로그인 계정으로 쓸 수 있어야 하므로,
# 배송 가능성까지 검증하는 EmailStr 대신 형식만 확인하는 패턴을 사용한다.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _validate_menu_permissions(value: list[str]) -> list[str]:
    invalid = set(value) - set(MENU_PERMISSION_KEYS)
    if invalid:
        raise ValueError(f"알 수 없는 메뉴 권한 키입니다: {', '.join(sorted(invalid))}")
    return list(dict.fromkeys(value))


class LoginRequest(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_no: str
    email: str
    name: str
    role: UserRole
    grade: JobGrade
    title: JobTitle | None
    hire_date: date
    birth_date: date | None
    address: str | None
    is_active: bool
    menu_permissions: list[str]


class UserCreate(BaseModel):
    employee_no: str
    email: str = Field(pattern=EMAIL_PATTERN)
    name: str
    password: str = Field(min_length=4)
    grade: JobGrade = JobGrade.staff
    title: JobTitle | None = None
    hire_date: date
    birth_date: date | None = None
    address: str | None = None
    menu_permissions: list[str] = Field(default_factory=list)

    _validate_menu_permissions = field_validator("menu_permissions")(_validate_menu_permissions)


class UserUpdate(BaseModel):
    name: str
    grade: JobGrade
    title: JobTitle | None = None
    hire_date: date
    birth_date: date | None = None
    address: str | None = None
    menu_permissions: list[str] = Field(default_factory=list)

    _validate_menu_permissions = field_validator("menu_permissions")(_validate_menu_permissions)


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=4)
