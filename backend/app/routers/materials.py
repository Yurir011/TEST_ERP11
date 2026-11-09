"""자재관리: 항목(회로부품/사출물/부자재/소모품)+이름, 하위 속성(트리), 입고·추가 입고·출고 기록. 현재 개수는 입출고 합계로 계산한다.

로그인한 직원(사이트 관리자 제외) 누구나 조회·등록·수정·입출고 기록을 할 수 있고, 자재와 입출고 기록을 지우는 것은 대표만 한다.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.material import CATEGORY_LABELS, MATERIAL_CATEGORIES, Material, MaterialMovement
from app.models.user import User, UserRole
from app.schemas.material import (
    MaterialDetailOut,
    MaterialIn,
    MaterialOut,
    MovementBrief,
    MovementIn,
    MovementOut,
)

logger = get_logger("Materials")


def require_material_access(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role == UserRole.site_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="자재관리 권한이 없습니다.")
    return current_user


router = APIRouter(prefix="/api/materials", tags=["materials"], dependencies=[Depends(require_material_access)])


def _stock(m: Material) -> int:
    return sum(x.quantity if x.kind in ("in", "add") else -x.quantity for x in m.movements)


def _latest(m: Material, kinds: tuple[str, ...]) -> MovementBrief | None:
    rows = [x for x in m.movements if x.kind in kinds]  # movements 는 최근순
    return MovementBrief(movement_date=rows[0].movement_date, quantity=rows[0].quantity) if rows else None


def _out(m: Material) -> MaterialOut:
    return MaterialOut(
        id=m.id,
        category=m.category,
        category_label=CATEGORY_LABELS.get(m.category, m.category),
        name=m.name,
        sub_levels=list(m.sub_levels or []),
        current_qty=_stock(m),
        last_in=_latest(m, ("in", "add")),
        last_out=_latest(m, ("out",)),
        updated_at=m.updated_at,
    )


def _movement_out(x: MaterialMovement, names: dict[int, str]) -> MovementOut:
    return MovementOut(
        id=x.id,
        kind=x.kind,
        movement_date=x.movement_date,
        quantity=x.quantity,
        reason=x.reason,
        note=x.note,
        created_by=x.created_by,
        created_by_name=names.get(x.created_by),
        created_at=x.created_at,
    )


def _detail(db: Session, m: Material) -> MaterialDetailOut:
    ids = {x.created_by for x in m.movements}
    names = {u.id: u.name for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    base = _out(m)
    return MaterialDetailOut(
        **base.model_dump(),
        memo=m.memo,
        total_in=sum(x.quantity for x in m.movements if x.kind == "in"),
        total_add=sum(x.quantity for x in m.movements if x.kind == "add"),
        total_out=sum(x.quantity for x in m.movements if x.kind == "out"),
        movements=[_movement_out(x, names) for x in m.movements],
    )


def _get_or_404(db: Session, material_id: int, lock: bool = False) -> Material:
    q = db.query(Material).options(selectinload(Material.movements))
    if lock:
        q = q.with_for_update(of=Material)  # 같은 자재에 동시에 출고해도 개수가 음수가 되지 않게 한다
    m = q.filter(Material.id == material_id).first()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="자재를 찾을 수 없습니다.")
    return m


@router.get("", response_model=list[MaterialOut])
def list_materials(
    category: str | None = Query(default=None, description="항목: ic(회로부품) / injection / subsidiary / consumable (없으면 전체)"),
    q: str | None = Query(default=None, description="이름·하위 속성 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_material_access),
):
    if category is not None and category not in MATERIAL_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="알 수 없는 항목입니다.")
    query = db.query(Material).options(selectinload(Material.movements))
    if category:
        query = query.filter(Material.category == category)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Material.name.ilike(like), func.array_to_string(Material.sub_levels, " ").ilike(like), Material.memo.ilike(like)))
    rows = query.order_by(Material.category, Material.name).all()
    logger.debug(f"[Materials] 목록 조회: category={category}, q={q!r}, count={len(rows)}, by={current_user.id}")
    return [_out(m) for m in rows]


@router.post("", response_model=MaterialDetailOut, status_code=status.HTTP_201_CREATED)
def create_material(payload: MaterialIn, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = Material(category=payload.category, name=payload.name, sub_levels=payload.sub_levels, memo=payload.memo, created_by=current_user.id)
    db.add(m)
    if payload.initial_in is not None:
        m.movements.append(
            MaterialMovement(kind="in", movement_date=payload.initial_in.movement_date, quantity=payload.initial_in.quantity, created_by=current_user.id)
        )
    db.commit()
    m = _get_or_404(db, m.id)
    logger.debug(f"[Materials] 등록: id={m.id}, category={m.category}, name={m.name}, levels={m.sub_levels}, initial_in={payload.initial_in}, by={current_user.id}")
    return _detail(db, m)


@router.get("/{material_id}", response_model=MaterialDetailOut)
def get_material(material_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = _get_or_404(db, material_id)
    logger.debug(f"[Materials] 상세 조회: id={material_id}, by={current_user.id}")
    return _detail(db, m)


@router.put("/{material_id}", response_model=MaterialDetailOut)
def update_material(material_id: int, payload: MaterialIn, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = _get_or_404(db, material_id)
    m.category = payload.category
    m.name = payload.name
    m.sub_levels = payload.sub_levels
    m.memo = payload.memo
    db.commit()
    m = _get_or_404(db, material_id)
    logger.debug(f"[Materials] 수정: id={material_id}, by={current_user.id}")
    return _detail(db, m)


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    m = _get_or_404(db, material_id)
    name = m.name
    db.delete(m)  # 입출고 기록도 함께 지워진다
    db.commit()
    logger.debug(f"[Materials] 삭제: id={material_id}, name={name}, by={current_user.id}")


@router.post("/{material_id}/movements", response_model=MaterialDetailOut, status_code=status.HTTP_201_CREATED)
def add_movement(material_id: int, payload: MovementIn, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = _get_or_404(db, material_id, lock=True)
    if payload.kind == "out" and payload.quantity > _stock(m):
        logger.debug(f"[Materials] 출고 거절(개수 부족): id={material_id}, 요청={payload.quantity}, 현재={_stock(m)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"현재 개수({_stock(m)}개)보다 많이 출고할 수 없습니다.")
    m.movements.append(
        MaterialMovement(
            kind=payload.kind,
            movement_date=payload.movement_date,
            quantity=payload.quantity,
            reason=payload.reason,
            note=payload.note,
            created_by=current_user.id,
        )
    )
    db.commit()
    m = _get_or_404(db, material_id)
    logger.debug(
        f"[Materials] 입출고 기록: id={material_id}, kind={payload.kind}, date={payload.movement_date}, qty={payload.quantity}, "
        f"reason={payload.reason!r}, 현재={_stock(m)}, by={current_user.id}"
    )
    return _detail(db, m)


@router.delete("/{material_id}/movements/{movement_id}", response_model=MaterialDetailOut)
def delete_movement(material_id: int, movement_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """잘못 기록한 입출고 한 줄을 지운다 (대표만). 지운 뒤 현재 개수가 음수가 되면 거절한다."""
    m = _get_or_404(db, material_id, lock=True)
    target = next((x for x in m.movements if x.id == movement_id), None)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="입출고 기록을 찾을 수 없습니다.")
    after = _stock(m) - (target.quantity if target.kind in ("in", "add") else -target.quantity)
    if after < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이 입고를 지우면 현재 개수가 0보다 작아져 지울 수 없습니다.")
    m.movements.remove(target)
    db.commit()
    m = _get_or_404(db, material_id)
    logger.debug(f"[Materials] 입출고 기록 삭제: material_id={material_id}, movement_id={movement_id}, 현재={_stock(m)}, by={current_user.id}")
    return _detail(db, m)
