"""입출금(payments) 특성화 테스트 — 라우터의 처리 코드를 서비스로 옮기기 전 안전망.

고정하는 것: API 경로 목록, 법인카드 결제예정(등록·요약·결제일 일괄확정·CSV 가져오기·수정 시 해제),
월별 집계(결제예정 제외), 목록 필터(기간 우선·검색어), 수정 시 거래처 잔액 재정산.
"""
from datetime import date

import pytest

from app.main import app
from app.models.payment import CardType, Payment
from app.models.user import JobTitle, UserRole
from app.services import card_billing


@pytest.fixture()
def admin(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo)


@pytest.fixture()
def h(auth_headers, admin):
    return auth_headers(admin)


def _payment(**over):
    body = {
        "type": "withdrawal",
        "payment_date": "2026-09-10",
        "category": "소모품비",
        "description": "테스트",
        "amount": 10_000,
        "method": "corporate_card",
        "card_type": "bc",
    }
    body.update(over)
    return body


def _create(client, h, **over):
    res = client.post("/api/payments", headers=h, json=_payment(**over))
    assert res.status_code == 201, res.text
    return res.json()


# ── API 경로 목록 ─────────────────────────────────────────────────

EXPECTED_OPERATIONS = [
    ("DELETE", "/api/payments/{payment_id}", "delete_payment_api_payments__payment_id__delete", ["204", "422"]),
    ("GET", "/api/payments", "list_payments_api_payments_get", ["200", "422"]),
    ("GET", "/api/payments/card-pending", "get_card_pending_summary_api_payments_card_pending_get", ["200"]),
    ("GET", "/api/payments/export/excel", "export_payments_excel_api_payments_export_excel_get", ["200", "422"]),
    ("GET", "/api/payments/linkable-transactions", "list_linkable_transactions_api_payments_linkable_transactions_get", ["200", "422"]),
    ("GET", "/api/payments/report/monthly", "get_monthly_report_api_payments_report_monthly_get", ["200", "422"]),
    ("GET", "/api/payments/{payment_id}", "get_payment_api_payments__payment_id__get", ["200", "422"]),
    ("GET", "/api/payments/{payment_id}/excel", "get_payment_voucher_excel_api_payments__payment_id__excel_get", ["200", "422"]),
    ("GET", "/api/payments/{payment_id}/pdf", "get_payment_voucher_pdf_api_payments__payment_id__pdf_get", ["200", "422"]),
    ("GET", "/api/payments/{payment_id}/receipt", "get_receipt_api_payments__payment_id__receipt_get", ["200", "422"]),
    ("POST", "/api/payments", "create_payment_api_payments_post", ["201", "422"]),
    ("POST", "/api/payments/card-settle", "settle_card_payments_api_payments_card_settle_post", ["200", "422"]),
    ("POST", "/api/payments/import-csv", "import_card_statement_api_payments_import_csv_post", ["200", "422"]),
    ("POST", "/api/payments/{payment_id}/receipt", "upload_receipt_api_payments__payment_id__receipt_post", ["200", "422"]),
    ("PUT", "/api/payments/{payment_id}", "update_payment_api_payments__payment_id__put", ["200", "422"]),
]


def test_api_operations_are_unchanged():
    actual = [
        (method.upper(), path, op["operationId"], sorted(op["responses"]))
        for path, ops in app.openapi()["paths"].items()
        if path.startswith("/api/payments")
        for method, op in ops.items()
    ]
    assert sorted(actual) == sorted(EXPECTED_OPERATIONS)


# ── 법인카드 결제예정 ──────────────────────────────────────────────

def test_card_withdrawal_is_pending_until_settled(client, h):
    p = _create(client, h)
    assert p["card_pending"] is True
    assert p["card_used_date"] == "2026-09-10"

    bank = _create(client, h, method="bank_transfer", card_type=None, bank_type="ibk")
    assert bank["card_pending"] is False and bank["card_used_date"] is None
    deposit = _create(client, h, type="deposit", category="선수금")
    assert deposit["card_pending"] is False  # 입금은 카드여도 결제예정이 아니다


def test_card_pending_summary_and_settle(client, h, db):
    _create(client, h, payment_date="2026-09-05", amount=10_000)
    _create(client, h, payment_date="2026-09-25", amount=20_000)
    _create(client, h, payment_date="2026-10-02", amount=40_000)  # 다음 결제일에 청구될 건
    _create(client, h, payment_date="2026-09-07", amount=7_000, card_type="kb_kookmin")

    res = client.get("/api/payments/card-pending", headers=h)
    assert res.status_code == 200
    rows = {r["card_type"]: r for r in res.json()}
    assert set(rows) == {"bc", "kb_kookmin"}

    bc = rows["bc"]
    settle = card_billing.default_settle_date(CardType.bc, date(2026, 9, 5), date.today())
    assert bc["default_settle_date"] == settle.isoformat()
    assert (bc["usage_from"], bc["usage_to"]) == ("2026-09-01", "2026-09-30")
    assert (bc["count"], bc["total_amount"]) == (2, 30_000)
    assert (bc["oldest_used_date"], bc["newest_used_date"]) == ("2026-09-05", "2026-09-25")
    assert (bc["later_count"], bc["later_amount"]) == (1, 40_000)
    assert (rows["kb_kookmin"]["count"], rows["kb_kookmin"]["total_amount"]) == (1, 7_000)

    res = client.post("/api/payments/card-settle", headers=h, json={"card_type": "bc", "settle_date": settle.isoformat()})
    assert res.status_code == 200, res.text
    assert res.json() == {"settled_count": 2, "total_amount": 30_000}

    bc_rows = db.query(Payment).filter(Payment.card_type == CardType.bc).order_by(Payment.card_used_date, Payment.payment_date).all()
    settled = [p for p in bc_rows if not p.card_pending]
    assert len(settled) == 2
    assert all(p.payment_date == settle for p in settled)  # 날짜가 결제일로 바뀐다
    assert sorted(p.card_used_date for p in settled) == [date(2026, 9, 5), date(2026, 9, 25)]  # 사용일은 남는다
    assert [p.amount for p in bc_rows if p.card_pending] == [40_000]
    # 다른 카드는 그대로
    assert db.query(Payment).filter(Payment.card_type == CardType.kb_kookmin, Payment.card_pending.is_(True)).count() == 1


def test_csv_import_records_card_pending_withdrawals(client, h, db):
    csv = "이용일자,가맹점명,이용금액\n2026-09-03,문구점,12000\n2026-09-04,식당,\"33,000\"\n".encode("utf-8")
    res = client.post(
        "/api/payments/import-csv?card_type=kb_kookmin", headers=h, files={"file": ("s.csv", csv, "text/csv")}
    )
    assert res.status_code == 200, res.text
    assert res.json()["imported"] == 2
    rows = db.query(Payment).filter(Payment.card_type == CardType.kb_kookmin).order_by(Payment.payment_date).all()
    assert [(r.payment_date, r.description, r.amount, r.category, r.card_pending, r.card_used_date) for r in rows] == [
        (date(2026, 9, 3), "문구점", 12_000, "법인카드", True, date(2026, 9, 3)),
        (date(2026, 9, 4), "식당", 33_000, "법인카드", True, date(2026, 9, 4)),
    ]


def test_update_card_pending_payment(client, h):
    p = _create(client, h)
    # 카드 출금으로 남으면 사용일만 갱신
    res = client.put(f"/api/payments/{p['id']}", headers=h, json=_payment(payment_date="2026-09-12"))
    assert res.status_code == 200, res.text
    assert (res.json()["card_pending"], res.json()["card_used_date"]) == (True, "2026-09-12")
    # 다른 결제수단으로 바꾸면 결제예정 해제
    res = client.put(
        f"/api/payments/{p['id']}", headers=h, json=_payment(method="bank_transfer", card_type=None, bank_type="ibk")
    )
    assert (res.json()["card_pending"], res.json()["card_used_date"]) == (False, None)
    # 결제예정이 아닌 내역을 카드로 바꿔도 결제예정이 되지 않는다
    res = client.put(f"/api/payments/{p['id']}", headers=h, json=_payment())
    assert res.json()["card_pending"] is False


# ── 월별 집계·목록 ────────────────────────────────────────────────

def test_monthly_report_excludes_card_pending(client, h):
    _create(client, h, type="deposit", category="선수금", method="bank_transfer", card_type=None, bank_type="ibk", amount=500_000)
    _create(client, h, method="bank_transfer", card_type=None, bank_type="ibk", amount=120_000)
    _create(client, h, amount=99_000)  # 카드 결제예정 → 제외
    _create(client, h, method="cash", card_type=None, amount=1_000, payment_date="2026-08-31")  # 다른 달
    res = client.get("/api/payments/report/monthly?year=2026&month=9", headers=h)
    assert res.json() == {"year": 2026, "month": 9, "total_deposit": 500_000, "total_withdrawal": 120_000, "net": 380_000}


def test_list_filters(client, h, make_client):
    c = make_client(name="필터상사")
    a = _create(client, h, method="cash", card_type=None, payment_date="2026-09-01", client_id=c.id)
    b = _create(client, h, method="cash", card_type=None, payment_date="2026-09-20", description="볼펜 구매")
    d = _create(client, h, payment_date="2026-10-05")

    def ids(qs):
        res = client.get(f"/api/payments?{qs}", headers=h)
        assert res.status_code == 200, res.text
        return [x["id"] for x in res.json()]

    assert ids("year=2026&month=9") == [b["id"], a["id"]]  # 최신순
    assert ids("year=2026&month=9&date_from=2026-09-15&date_to=2026-10-31") == [d["id"], b["id"]]  # 기간이 연/월보다 우선
    assert ids("q=필터상사") == [a["id"]]  # 거래처명 검색
    assert ids("q=볼펜") == [b["id"]]
    assert ids("method=corporate_card") == [d["id"]]
    assert ids("card_pending=true") == [d["id"]]


# ── 수정 시 거래처 잔액 재정산 ─────────────────────────────────────

def _settle(**over):
    base = {"type": "deposit", "category": "외상매출금", "method": "bank_transfer", "card_type": None, "bank_type": "ibk"}
    return _payment(**(base | over))


def test_update_resettles_client_balance(client, h, make_client, db):
    c = make_client(name="잔액상사", receivable=100_000)
    p = client.post("/api/payments", headers=h, json=_settle(client_id=c.id, amount=30_000)).json()
    db.refresh(c)
    assert c.receivable_amount == 70_000

    # 금액 변경: 이전 금액을 되돌리고 새 금액을 반영
    assert client.put(f"/api/payments/{p['id']}", headers=h, json=_settle(client_id=c.id, amount=100_000)).status_code == 200
    db.refresh(c)
    assert c.receivable_amount == 0
    # 잔액보다 많으면 거부하고 아무것도 바꾸지 않는다 (되돌려질 100,000 까지 감안해 한도는 100,000)
    res = client.put(f"/api/payments/{p['id']}", headers=h, json=_settle(client_id=c.id, amount=100_001))
    assert res.status_code == 400
    db.refresh(c)
    assert c.receivable_amount == 0

    # 다른 거래처로 옮기면 원래 거래처는 복원, 새 거래처에서 차감
    c2 = make_client(name="잔액상사2", receivable=50_000)
    assert client.put(f"/api/payments/{p['id']}", headers=h, json=_settle(client_id=c2.id, amount=20_000)).status_code == 200
    db.refresh(c)
    db.refresh(c2)
    assert (c.receivable_amount, c2.receivable_amount) == (100_000, 30_000)

    # 정산이 아닌 분류로 바꾸면 잔액을 되돌린다
    assert client.put(f"/api/payments/{p['id']}", headers=h, json=_settle(client_id=c2.id, amount=20_000, category="선수금")).status_code == 200
    db.refresh(c2)
    assert c2.receivable_amount == 50_000


def test_update_to_missing_client_is_rejected(client, h, make_client, db):
    c = make_client(name="잔액상사3", receivable=10_000)
    p = client.post("/api/payments", headers=h, json=_settle(client_id=c.id, amount=10_000)).json()
    res = client.put(f"/api/payments/{p['id']}", headers=h, json=_settle(client_id=999_999, amount=10_000))
    assert res.status_code == 400
    assert res.json()["detail"] == "존재하지 않는 거래처입니다."
