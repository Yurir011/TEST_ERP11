from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.approval import APPROVER_TITLES
from app.core.deps import get_current_user, require_admin_or_site_admin
from app.core.security import hash_password
from app.database import get_db
from app.logging_config import get_logger
from app.models.user import JobTitle, User, UserRole, resolve_role
from app.schemas.user import ApproverOut, NextEmployeeNoOut, PasswordResetRequest, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])
logger = get_logger("Users")

# 9000번대는 사이트 관리자 전용으로 예약되어 있어 일반 직원 채번 대상에서 제외한다.
SITE_ADMIN_NO_RANGE_START = 9000
DEFAULT_START_EMPLOYEE_NO = 1000


def _generate_next_employee_no(db: Session) -> str:
    numeric_nos = [
        int(no)
        for (no,) in db.query(User.employee_no).all()
        if no.isdigit() and int(no) < SITE_ADMIN_NO_RANGE_START
    ]
    next_no = max(numeric_nos) + 1 if numeric_nos else DEFAULT_START_EMPLOYEE_NO
    return str(next_no)


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    return db.query(User).order_by(User.employee_no).all()


@router.get("/approvers", response_model=list[ApproverOut])
def list_approvers(
    include_dept_head: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """결재권자(부서장/팀장/대표) 후보 목록. 일반 직원도 결재요청을 위해 호출해야 하므로
    admin 제한 없이 로그인한 누구나 조회 가능하다. 품의서 결재선처럼 부서장이 필요한 경우에만
    include_dept_head=true로 조회한다 (기존 결재 화면들은 팀장/대표만 사용)."""
    logger.debug(f"[Users] 결재권자 후보 조회: by={current_user.id}, include_dept_head={include_dept_head}")
    titles = (*APPROVER_TITLES, JobTitle.dept_head) if include_dept_head else APPROVER_TITLES
    return (
        db.query(User)
        .filter(User.title.in_(titles), User.is_active.is_(True))
        .order_by(User.title, User.name)
        .all()
    )


@router.get("/next-employee-no", response_model=NextEmployeeNoOut)
def get_next_employee_no(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    employee_no = _generate_next_employee_no(db)
    logger.debug(f"[Users] 다음 사번 미리보기: employee_no={employee_no}, by={current_user.id}")
    return NextEmployeeNoOut(employee_no=employee_no)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_site_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 이메일입니다.")

    employee_no = _generate_next_employee_no(db)
    logger.debug(f"[Users] 계정 생성: email={payload.email}, employee_no={employee_no}, menu_permissions={payload.menu_permissions}, by={current_user.id}")
    user = User(
        employee_no=employee_no,
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
