"""프로젝트(=제품 생산) BOM: 필요한 자재와 수량 등록·조회·수정·삭제. 자재관리에 없는 자재는 미등록 줄로 적어 두고 나중에 연결한다."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.material import CATEGORY_LABELS, IN_KINDS, Material, MaterialMovement
from app.models.project import Project
from app.models.project_bom import ProjectBomLine
from app.models.user import User
from app.schemas.project_bom import BomLineCreate, BomLineOut, BomLineUpdate, BomReleaseIn

router = APIRouter(prefix="/api/projects", tags=["project-bom"])
logger = get_logger("ProjectBom")


def _ensure_project(db: Session, project_id: int) -> None:
    if db.query(Project.id).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")


def _material_or_400(db: Session, material_id: int) -> Material:
    m = db.query(Material).options(selectinload(Material.movements)).filter(Material.id == material_id).first()
    if m is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자재관리에 없는 자재입니다. 목록을 새로고침해 주세요.")
    return m


def _stock(m: Material) -> int:
    return sum(x.quantity if x.kind in IN_KINDS else -x.quantity for x in m.movements)


BOM_OUT_REASON = "생산 불출"


def _released(line: ProjectBomLine) -> int:
    m = line.material
    if m is None:
        return 0
    return sum(x.quantity for x in m.movements if x.kind == "out" and x.bom_line_id == line.id)


def _out(line: ProjectBomLine) -> BomLineOut:
    m = line.material
    stock = _stock(m) if m is not None else None
    released = _released(line)
    need = max(line.quantity - released, 0)  # 아직 출고하지 않은 필요 수량
    return BomLineOut(
        id=line.id,
        material_id=line.material_id,
        registered=m is not None,
        code=m.code if m else None,
        item_name=m.name if m else line.item_name,
        category_label=CATEGORY_LABELS.get(m.category) if m else None,
        sub_levels=list(m.sub_levels or []) if m else [],
        quantity=line.quantity,
        note=line.note,
        current_qty=stock,
        shortage=(need - stock) if stock is not None and stock < need else None,
        released=released,
    )


def _get_line_or_404(db: Session, project_id: int, line_id: int) -> ProjectBomLine:
    line = (
        db.query(ProjectBomLine)
        .options(selectinload(ProjectBomLine.material).selectinload(Material.movements))
        .filter(ProjectBomLine.id == line_id, ProjectBomLine.project_id == project_id)
        .first()
    )
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BOM 줄을 찾을 수 없습니다.")
    return line


@router.get("/{project_id}/bom", response_model=list[BomLineOut])
def list_bom(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_project(db, project_id)
    lines = (
        db.query(ProjectBomLine)
        .options(selectinload(ProjectBomLine.material).selectinload(Material.movements))
        .filter(ProjectBomLine.project_id == project_id)
        .order_by(ProjectBomLine.id)
        .all()
    )
    logger.debug(f"[ProjectBom] 조회: project_id={project_id}, count={len(lines)}, by={current_user.id}")
    return [_out(x) for x in lines]


@router.post("/{project_id}/bom", response_model=BomLineOut, status_code=status.HTTP_201_CREATED)
def add_bom_line(project_id: int, payload: BomLineCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_project(db, project_id)
    if payload.material_id is not None:
        m = _material_or_400(db, payload.material_id)
        if db.query(ProjectBomLine.id).filter(ProjectBomLine.project_id == project_id, ProjectBomLine.material_id == m.id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 BOM에 있는 자재입니다. 수량을 고쳐 주세요.")
        name = m.name
    else:
        if not payload.item_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="자재 이름을 입력해주세요.")
        name = payload.item_name
    line = ProjectBomLine(project_id=project_id, material_id=payload.material_id, item_name=name, quantity=payload.quantity, note=payload.note, created_by=current_user.id)
    db.add(line)
    db.commit()
    line = _get_line_or_404(db, project_id, line.id)
    logger.debug(f"[ProjectBom] 추가: project_id={project_id}, line_id={line.id}, material_id={payload.material_id}, name={name}, qty={payload.quantity}, by={current_user.id}")
    return _out(line)


@router.put("/{project_id}/bom/{line_id}", response_model=BomLineOut)
def update_bom_line(project_id: int, line_id: int, payload: BomLineUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    line = _get_line_or_404(db, project_id, line_id)
    fields = payload.model_fields_set
    if "quantity" in fields and payload.quantity is not None:
        line.quantity = payload.quantity
    if "note" in fields:
        line.note = payload.note
    if payload.material_id is not None and line.material_id is None:  # 미등록 줄을 자재관리에 등록한 뒤 연결
        m = _material_or_400(db, payload.material_id)
        if db.query(ProjectBomLine.id).filter(ProjectBomLine.project_id == project_id, ProjectBomLine.material_id == m.id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 BOM에 있는 자재입니다.")
        line.material_id = m.id
        line.item_name = m.name
    db.commit()
    line = _get_line_or_404(db, project_id, line_id)
    logger.debug(f"[ProjectBom] 수정: project_id={project_id}, line_id={line_id}, by={current_user.id}")
    return _out(line)


@router.delete("/{project_id}/bom/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bom_line(project_id: int, line_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    line = _get_line_or_404(db, project_id, line_id)
    db.delete(line)
    db.commit()
    logger.debug(f"[ProjectBom] 삭제: project_id={project_id}, line_id={line_id}, by={current_user.id}")


@router.post("/{project_id}/bom/release", response_model=list[BomLineOut])
def release_bom(project_id: int, payload: BomReleaseIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """BOM 에서 고른 줄을 재고에서 출고한다. 자재관리의 출고 기록(사유 "생산 불출")이 줄마다 남고, 하나라도 안 되면 전체를 취소한다."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="프로젝트를 찾을 수 없습니다.")
    ids = [x.line_id for x in payload.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="같은 BOM 줄이 두 번 들어 있습니다.")
    logger.debug(f"[ProjectBom] 출고 시도: project_id={project_id}, lines={len(ids)}, by={current_user.id}")
    lines = (
        db.query(ProjectBomLine)
        .options(selectinload(ProjectBomLine.material).selectinload(Material.movements))
        .filter(ProjectBomLine.project_id == project_id, ProjectBomLine.id.in_(ids))
        .all()
    )
    by_id = {x.id: x for x in lines}
    material_ids = sorted({x.material_id for x in lines if x.material_id is not None})
    if material_ids:  # 같은 자재에 동시에 출고해도 재고가 음수가 되지 않게 먼저 잠근다 (id 순서로 잠가 교착을 피한다)
        db.query(Material.id).filter(Material.id.in_(material_ids)).order_by(Material.id).with_for_update().all()
        db.expire_all()
        lines = (
            db.query(ProjectBomLine)
            .options(selectinload(ProjectBomLine.material).selectinload(Material.movements))
            .filter(ProjectBomLine.project_id == project_id, ProjectBomLine.id.in_(ids))
            .all()
        )
        by_id = {x.id: x for x in lines}
    when = payload.release_date or date.today()
    plan: list[tuple[ProjectBomLine, int]] = []
    planned: dict[int, int] = {}  # 같은 자재가 여러 줄에 있어도 재고를 넘지 않도록 자재별로 합산한다
    for item in payload.items:  # 먼저 전부 검사하고, 하나라도 안 되면 아무것도 기록하지 않는다
        line = by_id.get(item.line_id)
        if line is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BOM 줄을 찾을 수 없습니다. 목록을 새로고침해 주세요.")
        m = line.material
        if m is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{line.item_name}' 은(는) 자재관리에 등록되어 있지 않아 출고할 수 없습니다.")
        remaining = line.quantity - _released(line)
        if item.quantity > remaining:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{m.name}' 은(는) 남은 필요 수량({max(remaining, 0):,}개)보다 많이 출고할 수 없습니다.")
        if planned.get(m.id, 0) + item.quantity > _stock(m):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{m.name}' 의 현재 재고({_stock(m):,}개)보다 많이 출고할 수 없습니다.")
        planned[m.id] = planned.get(m.id, 0) + item.quantity
        plan.append((line, item.quantity))
    for line, qty in plan:
        line.material.movements.append(
            MaterialMovement(
                kind="out",
                movement_date=when,
                quantity=qty,
                reason=BOM_OUT_REASON,
                note=f"{project.name} BOM 출고",
                bom_line_id=line.id,
                created_by=current_user.id,
            )
        )
        logger.debug(f"[ProjectBom] 출고 기록: project_id={project_id}, line_id={line.id}, material_id={line.material_id}, qty={qty}")
    db.commit()
    all_lines = (
        db.query(ProjectBomLine)
        .options(selectinload(ProjectBomLine.material).selectinload(Material.movements))
        .filter(ProjectBomLine.project_id == project_id)
        .order_by(ProjectBomLine.id)
        .all()
    )
    logger.debug(f"[ProjectBom] 출고 완료: project_id={project_id}, lines={len(ids)}, by={current_user.id}")
    return [_out(x) for x in all_lines]
