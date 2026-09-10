from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole

# 사내망 전용 시스템이라 .local 등 예약 도메인도 로그인 계정으로 쓸 수 있어야 하므로,
# 배송 가능성까지 검증하는 EmailStr 대신 형식만 확인하는 패턴을 사용한다.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


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
    department: str | None
    hire_date: date
    is_active: bool


class UserCreate(BaseModel):
    employee_no: str
    email: str = Field(pattern=EMAIL_PATTERN)
    name: str
    password: str = Field(min_length=4)
    role: UserRole = UserRole.employee
    department: str | None = None
    hire_date: date


class UserUpdate(BaseModel):
    name: str
    department: str | None = None
    hire_date: date
    role: UserRole


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=4)
