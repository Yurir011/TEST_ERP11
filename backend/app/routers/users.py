from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.core.security import hash_password
from app.database import get_db
from app.logging_config import get_logger
from app.models.user import User, UserRole
from app.schemas.user import PasswordResetRequest, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])
logger = get_logger("Users")


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return db.query(User).order_by(User.employee_no).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 이메일입니다.")
    if db.query(User).filter(User.employee_no == payload.employee_no).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 사번입니다.")

    logger.debug(f"[Users] 계정 생성: email={payload.email}, by={current_user.id}")
    user = User(
        employee_no=payload.employee_no,
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        department=payload.department,
        hire_date=payload.hire_date,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    if user.id == current_user.id and payload.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="본인의 관리자 권한은 해제할 수 없습니다.")

    user.name = payload.name
    user.department = payload.department
    user.hire_date = payload.hire_date
    user.role = payload.role
    db.commit()
    db.refresh(user)
    logger.debug(f"[Users] 수정: id={user_id}, by={current_user.id}")
    return user


@router.put("/{user_id}/activate", response_model=UserOut)
def activate_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    user.is_active = True
    db.commit()
    db.refresh(user)
    logger.debug(f"[Users] 활성화: id={user_id}, by={current_user.id}")
    return user


@router.put("/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="본인 계정은 비활성화할 수 없습니다.")
    user.is_active = False
    db.commit()
    db.refresh(user)
    logger.debug(f"[Users] 비활성화: id={user_id}, by={current_user.id}")
    return user


@router.put("/{user_id}/reset-password", response_model=UserOut)
def reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    logger.debug(f"[Users] 비밀번호 초기화: id={user_id}, by={current_user.id}")
    return user
