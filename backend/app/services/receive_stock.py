"""구매 품의서 입고 때 자재 재고에 입고 기록을 만들고, 입고를 취소하면 되돌린다."""
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.material import IN_KINDS, Material, MaterialMovement
from app.models.proposal import Proposal
from app.models.user import User
from app.schemas.material import ReceiveStockLine

logger = get_logger("ReceiveStock")


def _stock(db: Session, material_id: int) -> int:
    rows = db.query(MaterialMovement.kind, func.coalesce(func.sum(MaterialMovement.quantity), 0)).filter(MaterialMovement.material_id == material_id).group_by(MaterialMovement.kind).all()
    return sum(int(q) if k in IN_KINDS else -int(q) for k, q in rows)


def apply_receive_stock(db: Session, p: Proposal, lines: list[ReceiveStockLine], received: date, user: User) -> None:
    """고른 자재마다 입고(처음) 또는 추가 입고 기록을 만든다. 품의서 번호를 메모에 적고 proposal_id 로 묶어 둔다."""
    for line in lines:
        m = db.query(Material).filter(Material.id == line.material_id).with_for_update().first()
        if m is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="선택한 자재를 찾을 수 없습니다.")
        has_any = db.query(MaterialMovement.id).filter(MaterialMovement.material_id == m.id).first() is not None
        db.add(
            MaterialMovement(
                material_id=m.id,
                kind="add" if has_any else "in",
                movement_date=received,
                quantity=line.quantity,
                reels=line.reels,
                reel_groups=[{"per_reel": g.per_reel, "reels": g.reels} for g in line.reel_groups] if line.reel_groups else None,
                note=f"구매 품의서 입고: {p.doc_no} {p.title}"[:500],
                proposal_id=p.id,
                created_by=user.id,
            )
        )
        db.flush()
        logger.debug(f"[ReceiveStock] 재고 입고: proposal={p.id}, material={m.id}, qty={line.quantity}, by={user.id}")


def revert_receive_stock(db: Session, p: Proposal) -> None:
    """이 품의서 입고로 만든 자재 입고 기록을 지운다. 이미 출고돼 재고가 모자라게 되면 취소할 수 없다."""
    rows = db.query(MaterialMovement).filter(MaterialMovement.proposal_id == p.id).all()
    per_material: dict[int, int] = {}
    for r in rows:
        per_material[r.material_id] = per_material.get(r.material_id, 0) + r.quantity
    for material_id, qty in per_material.items():
        if _stock(db, material_id) - qty < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 출고한 자재가 있어 입고를 취소할 수 없습니다. 자재 기록을 먼저 확인해 주세요.")
    for r in rows:
        db.delete(r)
    if rows:
        logger.debug(f"[ReceiveStock] 재고 입고 취소: proposal={p.id}, rows={len(rows)}")
