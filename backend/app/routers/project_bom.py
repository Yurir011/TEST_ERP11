"""프로젝트(=제품 생산) BOM: 필요한 자재와 수량 등록·조회·수정·삭제. 자재관리에 없는 자재는 미등록 줄로 적어 두고 나중에 연결한다."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.database import get_db
from app.logging_config import get_logger
from app.models.material import CATEGORY_LABELS, IN_KINDS, Material
from app.models.project import Project
from app.models.project_bom import ProjectBomLine
from app.models.user import User
from app.schemas.project_bom import BomLineCreate, BomLineOut, BomLineUpdate

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


def _out(line: ProjectBomLine) -> BomLineOut:
    m = line.material
    stock = _stock(m) if m is not None else None
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
        shortage=(line.quantity - stock) if stock is not None and stock < line.quantity else None,
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
