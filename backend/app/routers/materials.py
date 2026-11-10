"""자재관리: 항목(회로부품 전용·범용/사출물/부자재/포장재/소모품)+이름, 품목 코드, 속성(트리), 입고·추가 입고·출고 기록(개 또는 릴). 현재 개수는 입출고 합계로 계산한다.

로그인한 직원(사이트 관리자 제외) 누구나 조회·등록·수정·입출고 기록을 할 수 있고, 자재와 입출고 기록을 지우는 것은 대표만 한다.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Integer, func, or_, text
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user, require_admin
from app.database import get_db
from app.logging_config import get_logger
from app.models.material import CATEGORY_LABELS, IN_KINDS, KIND_LABELS, MATERIAL_CATEGORIES, Material, MaterialMovement, code_prefix
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
    return sum(x.quantity if x.kind in IN_KINDS else -x.quantity for x in m.movements)


def _settlement(m: Material, out: MaterialMovement) -> tuple[int | None, int | None, int | None]:
    """출고 한 건의 정산: (재입고 합계, 사용 합계, 로스). 재입고가 없으면 모두 None, 사용 개수를 적은 재입고가 없으면 사용·로스는 None.
    로스 = 출고 − 재입고 합계 − 사용 합계."""
    returns = [x for x in m.movements if x.kind == "return" and x.return_of == out.id]
    if not returns:
        return None, None, None
    returned = sum(x.quantity for x in returns)
    entered = [x.used_qty for x in returns if x.used_qty is not None]
    if not entered:
        return returned, None, None
    used = sum(entered)
    return returned, used, out.quantity - returned - used


def _reels(m: Material) -> int | None:
    """릴로 기록한 입출고가 있을 때만 현재 릴 수 (입고 + 추가 입고 − 출고). 없으면 None."""
    rows = [x for x in m.movements if x.reels is not None]
    return sum(x.reels if x.kind in IN_KINDS else -x.reels for x in rows) if rows else None


def _latest(m: Material, kinds: tuple[str, ...]) -> MovementBrief | None:
    rows = [x for x in m.movements if x.kind in kinds]  # movements 는 최근순
    if not rows:
        return None
    return MovementBrief(movement_date=rows[0].movement_date, quantity=rows[0].quantity, reels=rows[0].reels, reel_groups=rows[0].reel_groups)


def _groups(q) -> list[dict] | None:
    """입력의 릴 묶음을 저장 형태(JSON)로: [{"per_reel": 2500, "reels": 2}, ...]. 개로 적었으면 None."""
    return [{"per_reel": g.per_reel, "reels": g.reels} for g in q.reel_groups] if q.reel_groups else None


def _next_code(db: Session, prefix: str) -> str:
    """접두어별 다음 코드 (EC-0001, EC-0002 …). 동시에 등록해도 겹치지 않게 접두어별로 잠근다."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"material-code-{prefix}"})
    last = db.query(func.max(func.substring(Material.code, "[0-9]+$").cast(Integer))).filter(Material.code.like(f"{prefix}-%")).scalar()
    return f"{prefix}-{(last or 0) + 1:04d}"


def _out(m: Material) -> MaterialOut:
    return MaterialOut(
        id=m.id,
        code=m.code,
        category=m.category,
        category_label=CATEGORY_LABELS.get(m.category, m.category),
        kind=m.kind,
        kind_label=KIND_LABELS.get(m.kind) if m.kind else None,
        name=m.name,
        sub_levels=list(m.sub_levels or []),
        current_qty=_stock(m),
        current_reels=_reels(m),
        last_in=_latest(m, ("in", "add")),
        last_out=_latest(m, ("out",)),
        updated_at=m.updated_at,
    )


def _movement_out(x: MaterialMovement, names: dict[int, str], m: Material) -> MovementOut:
    returned, used, loss = _settlement(m, x) if x.kind == "out" else (None, None, None)
    return MovementOut(
        returned_qty=returned,
        used_total=used,
        loss_qty=loss,
        return_of=x.return_of,
        used_qty=x.used_qty,
        id=x.id,
        kind=x.kind,
        movement_date=x.movement_date,
        quantity=x.quantity,
        reels=x.reels,
        reel_groups=x.reel_groups,
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
        total_return=sum(x.quantity for x in m.movements if x.kind == "return"),
        total_loss=sum(loss for x in m.movements if x.kind == "out" and (loss := _settlement(m, x)[2]) is not None),
        movements=[_movement_out(x, names, m) for x in m.movements],
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
    category: str | None = Query(default=None, description="항목: ic(회로부품) / injection / subsidiary / packaging / consumable (없으면 전체)"),
    kind: str | None = Query(default=None, description="회로부품의 종류: dedicated(전용) / general(범용) (없으면 전체)"),
    q: str | None = Query(default=None, description="코드·이름·속성 검색어"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_material_access),
):
    if category is not None and category not in MATERIAL_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="알 수 없는 항목입니다.")
    query = db.query(Material).options(selectinload(Material.movements))
    if category:
        query = query.filter(Material.category == category)
    if kind:
        query = query.filter(Material.kind == kind)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Material.code.ilike(like), Material.name.ilike(like), func.array_to_string(Material.sub_levels, " ").ilike(like), Material.memo.ilike(like)))
    rows = query.order_by(Material.code).all()
    logger.debug(f"[Materials] 목록 조회: category={category}, kind={kind}, q={q!r}, count={len(rows)}, by={current_user.id}")
    return [_out(m) for m in rows]


@router.get("/level-history")
def level_history(db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    """속성 입력칸 아래에 나열할 '이전에 쓴 속성'. levels[0] 은 1번째 칸에 쓴 값들, levels[1] 은 2번째 칸… (많이 쓴 순서)."""
    counts: list[dict[str, int]] = []
    for (levels,) in db.query(Material.sub_levels).all():
        for i, v in enumerate(levels or []):
            while len(counts) <= i:
                counts.append({})
            counts[i][v] = counts[i].get(v, 0) + 1
    result = [[v for v, _ in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))] for c in counts]
    logger.debug(f"[Materials] 이전 속성 조회: 단계={len(result)}, by={current_user.id}")
    return {"levels": result}


@router.post("", response_model=MaterialDetailOut, status_code=status.HTTP_201_CREATED)
def create_material(payload: MaterialIn, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = Material(
        category=payload.category,
        kind=payload.kind,
        code=_next_code(db, code_prefix(payload.category, payload.kind)),
        name=payload.name,
        sub_levels=payload.sub_levels,
        memo=payload.memo,
        created_by=current_user.id,
    )
    db.add(m)
    if payload.initial_in is not None:
        i = payload.initial_in
        m.movements.append(
            MaterialMovement(kind="in", movement_date=i.movement_date, quantity=i.quantity, reels=i.reels, reel_groups=_groups(i), created_by=current_user.id)
        )
    db.commit()
    m = _get_or_404(db, m.id)
    logger.debug(f"[Materials] 등록: id={m.id}, code={m.code}, category={m.category}, kind={m.kind}, name={m.name}, levels={m.sub_levels}, initial_in={payload.initial_in}, by={current_user.id}")
    return _detail(db, m)


@router.get("/{material_id}", response_model=MaterialDetailOut)
def get_material(material_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = _get_or_404(db, material_id)
    logger.debug(f"[Materials] 상세 조회: id={material_id}, by={current_user.id}")
    return _detail(db, m)


@router.put("/{material_id}", response_model=MaterialDetailOut)
def update_material(material_id: int, payload: MaterialIn, db: Session = Depends(get_db), current_user: User = Depends(require_material_access)):
    m = _get_or_404(db, material_id)
    old_prefix = code_prefix(m.category, m.kind)
    new_prefix = code_prefix(payload.category, payload.kind)
    m.category = payload.category
    m.kind = payload.kind
    if new_prefix != old_prefix:  # 항목·종류가 바뀌면 코드도 새 접두어로 다시 붙인다
        m.code = _next_code(db, new_prefix)
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
    if payload.kind == "return":
        out = next((x for x in m.movements if x.id == payload.return_of and x.kind == "out"), None)
        if out is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="재입고할 출고 기록을 찾을 수 없습니다.")
        returned, used, _ = _settlement(m, out)
        total = (returned or 0) + (used or 0) + payload.quantity + (payload.used_qty or 0)
        if total > out.quantity:  # 이미 정산된 개수와 합쳐 출고한 개수를 넘으면 안 된다
            logger.debug(f"[Materials] 재입고 거절(출고 개수 초과): out_id={out.id}, 출고={out.quantity}, 합계={total}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"재입고와 사용 개수의 합({total:,}개)이 출고한 개수({out.quantity:,}개)보다 많습니다.",
            )
    if payload.kind == "out" and payload.quantity > _stock(m):
        logger.debug(f"[Materials] 출고 거절(개수 부족): id={material_id}, 요청={payload.quantity}, 현재={_stock(m)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"현재 개수({_stock(m)}개)보다 많이 출고할 수 없습니다.")
    m.movements.append(
        MaterialMovement(
            kind=payload.kind,
            movement_date=payload.movement_date,
            quantity=payload.quantity,
            reels=payload.reels,
            reel_groups=_groups(payload),
            return_of=payload.return_of,
            used_qty=payload.used_qty,
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
    if target.kind == "out" and any(x.return_of == target.id for x in m.movements):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이 출고에 연결된 재입고가 있어 지울 수 없습니다. 재입고 기록을 먼저 지워주세요.")
    after = _stock(m) - (target.quantity if target.kind in IN_KINDS else -target.quantity)
    if after < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이 입고를 지우면 현재 개수가 0보다 작아져 지울 수 없습니다.")
    m.movements.remove(target)
    db.commit()
    m = _get_or_404(db, material_id)
    logger.debug(f"[Materials] 입출고 기록 삭제: material_id={material_id}, movement_id={movement_id}, 현재={_stock(m)}, by={current_user.id}")
    return _detail(db, m)
