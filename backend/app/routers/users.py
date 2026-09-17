from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin_or_site_admin
from app.core.security import hash_password
from app.database import get_db
from app.logging_config import get_logger
from app.models.user import JobGrade, User, UserRole, resolve_role
from app.schemas.user import ApproverOut, PasswordResetRequest, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])
logger = get_logger("Users")


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    return db.query(User).order_by(User.employee_no).all()


@router.get("/approvers", response_model=list[ApproverOut])
def list_approvers(
    grade: JobGrade, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """결재요청 시 소장/과장 등 직급으로 실제 결재권자를 고르기 위한 최소 정보 목록.
    일반 직원도 결재요청을 위해 호출해야 하므로 admin 제한 없이 로그인한 누구나 조회 가능하다."""
    logger.debug(f"[Users] 결재권자 후보 조회: grade={grade}, by={current_user.id}")
    return (
        db.query(User)
        .filter(User.grade == grade, User.is_active.is_(True))
        .order_by(User.name)
        .all()
    )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 이메일입니다.")
    if db.query(User).filter(User.employee_no == payload.employee_no).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 사번입니다.")

    logger.debug(f"[Users] 계정 생성: email={payload.email}, menu_permissions={payload.menu_permissions}, by={current_user.id}")
    user = User(
        employee_no=payload.employee_no,
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        role=resolve_role(payload.title),
        grade=payload.grade,
        title=payload.title,
        hire_date=payload.hire_date,
        birth_date=payload.birth_date,
        address=payload.address,
        menu_permissions=payload.menu_permissions,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    # 사이트 관리자 계정은 직책이 없으므로 직책 기반 권한 계산 대상에서 제외하고 role을 그대로 유지한다.
    new_role = user.role if user.role == UserRole.site_admin else resolve_role(payload.title)
    if user.id == current_user.id and user.role == UserRole.admin and new_role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="본인의 직책을 변경하여 관리자 권한을 해제할 수 없습니다.")

    user.name = payload.name
    user.grade = payload.grade
    user.title = payload.title
    user.hire_date = payload.hire_date
    user.birth_date = payload.birth_date
    user.address = payload.address
    user.role = new_role
    user.menu_permissions = payload.menu_permissions
    db.commit()
    db.refresh(user)
    logger.debug(f"[Users] 수정: id={user_id}, menu_permissions={payload.menu_permissions}, by={current_user.id}")
    return user


@router.put("/{user_id}/activate", response_model=UserOut)
def activate_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    user.is_active = True
    db.commit()
    db.refresh(user)
    logger.debug(f"[Users] 활성화: id={user_id}, by={current_user.id}")
    return user


@router.put("/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
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
    current_user: User = Depends(require_admin_or_site_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    logger.debug(f"[Users] 비밀번호 초기화: id={user_id}, by={current_user.id}")
    return user
