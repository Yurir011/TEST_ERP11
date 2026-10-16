"""거래처 미수금/미지급금 잔액을 미결제 매입매출 건 기준으로 다시 맞추는 정리 스크립트.

잔액(clients.receivable_amount / payable_amount)을 다음 값으로 맞춘다.
  미수금  = 그 거래처의 미결제(settled=False) 매출 건들의 남은 금액(total_amount - paid_amount) 합계
  미지급금 = 그 거래처의 미결제 매입 건들의 남은 금액 합계

주의: 매입매출 건과 연결되지 않은 "잔액만" 입력·차감한 금액은 사라진다. 그래서 기본은 미리보기(dry-run)이고,
--apply 를 붙여야 실제로 바꾼다. 바꾸기 전 잔액은 JSON 파일로 백업한다.

사용법 (backend 폴더에서)
  venv\\Scripts\\python.exe -m app.scripts.reconcile_client_balances            # 미리보기
  venv\\Scripts\\python.exe -m app.scripts.reconcile_client_balances --apply    # 적용 (백업 파일 경로가 출력된다)
"""
import argparse
import json
import os
from datetime import datetime

from sqlalchemy import func

from app.database import SessionLocal
from app.logging_config import get_logger, setup_logging
from app.models.client import Client
from app.models.transaction import Transaction, TransactionType

logger = get_logger("ReconcileClientBalances")

BACKUP_DIR = os.path.join("storage", "backups")


def expected_balances(db) -> dict[int, tuple[int, int]]:
    """거래처 id -> (기대 미수금, 기대 미지급금)."""
    rows = (
        db.query(
            Transaction.client_id,
            Transaction.type,
            func.coalesce(func.sum(Transaction.total_amount - func.coalesce(Transaction.paid_amount, 0)), 0),
        )
        .filter(Transaction.settled.is_(False), Transaction.client_id.isnot(None))
        .group_by(Transaction.client_id, Transaction.type)
        .all()
    )
    result: dict[int, list[int]] = {}
    for client_id, tx_type, amount in rows:
        pair = result.setdefault(client_id, [0, 0])
        pair[0 if tx_type == TransactionType.sales else 1] += max(0, int(amount))
    return {k: (v[0], v[1]) for k, v in result.items()}


def main(apply: bool) -> None:
    with SessionLocal() as db:
        expected = expected_balances(db)
        clients = db.query(Client).order_by(Client.id).all()
        changes = []
        for c in clients:
            exp_r, exp_p = expected.get(c.id, (0, 0))
            cur_r, cur_p = c.receivable_amount or 0, c.payable_amount or 0
            if (cur_r, cur_p) != (exp_r, exp_p):
                changes.append({"client_id": c.id, "name": c.name, "receivable": [cur_r, exp_r], "payable": [cur_p, exp_p]})

        print(f"거래처 {len(clients)}곳 중 잔액이 다른 곳: {len(changes)}곳")
        for ch in changes:
            print(
                f"  - [{ch['client_id']}] {ch['name']}: 미수금 {ch['receivable'][0]:,} → {ch['receivable'][1]:,}, "
                f"미지급금 {ch['payable'][0]:,} → {ch['payable'][1]:,}"
            )
        if not changes:
            return
        if not apply:
            print("미리보기입니다. 실제로 바꾸려면 --apply 를 붙여 다시 실행하세요.")
            return

        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_path = os.path.join(BACKUP_DIR, f"client_balances_{datetime.now():%Y%m%d_%H%M%S}.json")
        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(
                [{"client_id": c.id, "name": c.name, "receivable_amount": c.receivable_amount, "payable_amount": c.payable_amount} for c in clients],
                f,
                ensure_ascii=False,
                indent=2,
            )
        by_id = {c.id: c for c in clients}
        for ch in changes:
            c = by_id[ch["client_id"]]
            c.receivable_amount = ch["receivable"][1]
            c.payable_amount = ch["payable"][1]
        db.commit()
        logger.info(f"[ReconcileClientBalances] 잔액 정리 적용: {len(changes)}곳, 백업={backup_path}")
        print(f"적용 완료: {len(changes)}곳. 이전 잔액 백업: {os.path.abspath(backup_path)}")


if __name__ == "__main__":
    setup_logging()
    parser = argparse.ArgumentParser(description="거래처 잔액을 미결제 매입매출 건 기준으로 맞춘다")
    parser.add_argument("--apply", action="store_true", help="실제로 적용한다 (기본은 미리보기)")
    main(parser.parse_args().apply)
