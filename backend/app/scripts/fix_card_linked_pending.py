"""외상 매입매출을 법인카드로 결제해 이미 '확정'으로 기록된 출금을 카드 결제예정으로 되돌린다 (일회성).

예전에는 매입매출을 연결한 카드 결제(구매 품의서의 카드 결제 포함)가 바로 확정 출금이 되어 카드 결제예정에 나타나지 않았다.
지금은 일반 카드 사용내역처럼 결제예정으로 시작하므로, 과거에 만들어진 같은 종류의 건을 한 번 맞춘다.

대상: 법인카드 출금이고, 매입매출(전액·부분)에 연결되어 있으며, 아직 카드 결제일 일괄처리를 한 적이 없는 건
      (card_pending=false, card_settled_date 없음). --since 이후 날짜 건만 본다 (기본: 최근 90일).
바뀌는 것: card_pending=true, card_used_date=입출금 날짜. 금액·날짜·매입매출 연결은 그대로 둔다.

기본은 목록만 보여 주는 점검 모드이고, --apply 를 붙여야 실제로 바꾼다. 실행 전에 DB 백업을 권한다.

사용법 (backend 폴더에서)
  venv\Scripts\python.exe -m app.scripts.fix_card_linked_pending                    # 대상 목록만 보기
  venv\Scripts\python.exe -m app.scripts.fix_card_linked_pending --since 2026-10-01 # 기준일 지정
  venv\Scripts\python.exe -m app.scripts.fix_card_linked_pending --apply            # 실제로 바꾸기
  venv\Scripts\python.exe -m app.scripts.fix_card_linked_pending --apply --id 123   # 한 건만
"""
import argparse
from datetime import date, timedelta

from app.database import SessionLocal
from app.logging_config import get_logger, setup_logging
from app.models.payment import Payment, PaymentMethod, PaymentType
from app.models.transaction import Transaction

logger = get_logger("FixCardLinkedPending")


def find_candidates(db, since: date, only_id: int | None = None) -> list[Payment]:
    linked_ids = {tx.settled_payment_id for tx in db.query(Transaction).filter(Transaction.settled_payment_id.isnot(None))}
    query = db.query(Payment).filter(
        Payment.type == PaymentType.withdrawal,
        Payment.method == PaymentMethod.corporate_card,
        Payment.card_pending.is_(False),
        Payment.card_settled_date.is_(None),
        Payment.payment_date >= since,
    )
    if only_id is not None:
        query = query.filter(Payment.id == only_id)
    rows = query.order_by(Payment.payment_date, Payment.id).all()
    return [p for p in rows if p.partial_transaction_id is not None or p.id in linked_ids]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="실제로 바꾼다 (없으면 목록만 보여 준다)")
    parser.add_argument("--since", type=date.fromisoformat, default=date.today() - timedelta(days=90), help="이 날짜 이후 건만 (YYYY-MM-DD)")
    parser.add_argument("--id", type=int, default=None, help="한 건만 처리할 입출금 id")
    args = parser.parse_args()
    setup_logging()

    db = SessionLocal()
    try:
        rows = find_candidates(db, args.since, args.id)
        print(f"대상 {len(rows)}건 (기준일 {args.since} 이후, 매입매출 연결 법인카드 출금 중 결제일 처리 전)")
        for p in rows:
            print(f"  id={p.id} {p.payment_date} {p.category} {p.description} ₩{p.amount:,} 카드={p.card_type}")
        if not args.apply:
            print("점검 모드입니다. 바꾸려면 --apply 를 붙여 다시 실행하세요.")
            return
        for p in rows:
            p.card_pending = True
            p.card_used_date = p.payment_date
        db.commit()
        logger.info(f"[FixCardLinkedPending] 결제예정으로 되돌림: {len(rows)}건, ids={[p.id for p in rows]}")
        print(f"{len(rows)}건을 카드 결제예정으로 바꿨습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
