"""매입매출(transactions) 특성화 테스트 — 조회·세금계산서 판단 코드를 서비스로 옮기기 전 안전망.

고정하는 것: API 경로 목록, 목록 필터(연/월·기간·결제여부), 부가세 리포트, 연결 가능한 세금계산서 목록
(매출/매입 판단·금액·품목명 요약·제외 조건), 세금계산서 불러오기 등록(연결·중복 거부), 부분 결제 후 합계 축소 거부.
외상 잔액 반영은 test_credit_settlement.py 가 고정한다.
"""
from datetime import date

import pytest

from app.main import app
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentItem, ProjectDocumentStatus
from app.models.user import JobTitle, UserRole


@pytest.fixture()
def admin(make_user):
    return make_user(role=UserRole.admin, title=JobTitle.ceo)


@pytest.fixture()
def h(auth_headers, admin):
    return auth_headers(admin)


def _tx(**over):
    body = {
        "type": "sales",
        "transaction_date": "2026-09-10",
        "item_name": "품목",
        "supply_amount": 100_000,
        "vat_amount": 10_000,
        "settled": True,
    }
    body.update(over)
    return body


def _create(client, h, **over):
    res = client.post("/api/transactions", headers=h, json=_tx(**over))
    assert res.status_code == 201, res.text
    return res.json()


def _invoice(db, admin, *, client_name="세금상사", items=((2, 50_000.4, "부품A"),), status=ProjectDocumentStatus.approved, **over):
    doc = ProjectDocument(
        doc_type=over.pop("doc_type", ProjectDocType.tax_invoice),
        issue_date=over.pop("issue_date", date(2026, 9, 15)),
        client_name=client_name,
        status=status,
        created_by=admin.id,
        **over,
    )
    doc.items = [ProjectDocumentItem(quantity=q, unit_price=p, content=c, sort_order=i) for i, (q, p, c) in enumerate(items)]
    db.add(doc)
    db.flush()
    return doc


EXPECTED_OPERATIONS = [
    ("DELETE", "/api/transactions/{tx_id}", "delete_transaction_api_transactions__tx_id__delete", ["204", "422"]),
    ("GET", "/api/transactions", "list_transactions_api_transactions_get", ["200", "422"]),
    ("GET", "/api/transactions/export/excel", "export_transactions_excel_api_transactions_export_excel_get", ["200", "422"]),
    ("GET", "/api/transactions/linkable-tax-invoices", "list_linkable_tax_invoices_api_transactions_linkable_tax_invoices_get", ["200", "422"]),
    ("GET", "/api/transactions/report/vat", "get_vat_report_api_transactions_report_vat_get", ["200", "422"]),
    ("GET", "/api/transactions/{tx_id}", "get_transaction_api_transactions__tx_id__get", ["200", "422"]),
    ("POST", "/api/transactions", "create_transaction_api_transactions_post", ["201", "422"]),
    ("POST", "/api/transactions/import-hometax", "import_hometax_api_transactions_import_hometax_post", ["200", "422"]),
    ("POST", "/api/transactions/import-hometax/preview", "preview_hometax_import_api_transactions_import_hometax_preview_post", ["200", "422"]),
    ("PUT", "/api/transactions/{tx_id}", "update_transaction_api_transactions__tx_id__put", ["200", "422"]),
]


def test_api_operations_are_unchanged():
    actual = [
        (method.upper(), path, op["operationId"], sorted(op["responses"]))
        for path, ops in app.openapi()["paths"].items()
        if path.startswith("/api/transactions")
        for method, op in ops.items()
    ]
    assert sorted(actual) == sorted(EXPECTED_OPERATIONS)


def test_list_filters(client, h):
    a = _create(client, h, transaction_date="2026-09-01")
    b = _create(client, h, transaction_date="2026-09-20", type="purchase", settled=False)
    c = _create(client, h, transaction_date="2026-10-05")

    def ids(qs):
        res = client.get(f"/api/transactions?{qs}", headers=h)
        assert res.status_code == 200, res.text
        return [x["id"] for x in res.json()]

    assert ids("year=2026&month=9") == [b["id"], a["id"]]  # 최신순
    assert ids("start_date=2026-09-15&end_date=2026-10-31") == [c["id"], b["id"]]
    assert ids("year=2026&month=9&start_date=2026-09-15") == [b["id"]]  # 연/월과 기간을 함께 적용
    assert ids("type=purchase") == [b["id"]]
    assert ids("settled=false") == [b["id"]]
    assert ids("settled=true&year=2026") == [c["id"], a["id"]]


def test_vat_report(client, h):
    _create(client, h, supply_amount=300_000, vat_amount=30_000)
    _create(client, h, supply_amount=200_000, vat_amount=20_000, settled=False)
    _create(client, h, type="purchase", supply_amount=100_000, vat_amount=10_000)
    _create(client, h, transaction_date="2026-10-01", supply_amount=999_000, vat_amount=99_900)  # 다른 달
    res = client.get("/api/transactions/report/vat?year=2026&month=9", headers=h)
    assert res.json() == {
        "year": 2026,
        "month": 9,
        "sales_supply": 500_000,
        "sales_vat": 50_000,
        "purchase_supply": 100_000,
        "purchase_vat": 10_000,
        "payable_vat": 40_000,
    }


def test_linkable_tax_invoices(client, h, db, admin):
    billing = _invoice(db, admin, purpose_type="청구", items=((2, 50_000.4, "부품A"), (1, 1_000, "부품B"), (1, 500, "")))
    receipt = _invoice(db, admin, client_name="매입상사", purpose_type="영수", approval_no="NTS-1")
    received_sales = _invoice(db, admin, client_name="받은상사", purpose_type="영수", direction="sales")
    received_purchase = _invoice(db, admin, client_name="받은상사2", purpose_type="청구", direction="purchase", items=())
    _invoice(db, admin, client_name="반려상사", status=ProjectDocumentStatus.rejected)  # 제외
    _invoice(db, admin, client_name="견적상사", doc_type=ProjectDocType.quotation)  # 제외
    linked_tx = _create(client, h)
    _invoice(db, admin, client_name="연결상사", ledger_transaction_id=linked_tx["id"])  # 이미 연결 → 제외

    res = client.get("/api/transactions/linkable-tax-invoices", headers=h)
    assert res.status_code == 200, res.text
    rows = {r["id"]: r for r in res.json()}
    assert set(rows) == {billing.id, receipt.id, received_sales.id, received_purchase.id}

    b = rows[billing.id]
    # 품목별 반올림 후 합산: 2 x 50,000.4 = 100,000.8 → 100,001 / + 1,000 + 500 = 101,501, 부가세 10% 사사오입 10,150
    assert (b["type"], b["supply_amount"], b["vat_amount"]) == ("sales", 101_501, 10_150)
    assert b["item_name"] == "부품A 외 1건"  # 내용이 빈 품목은 세지 않는다
    assert (b["status"], b["client_name"], b["tax_invoice_no"]) == ("approved", "세금상사", None)
    assert (rows[receipt.id]["type"], rows[receipt.id]["tax_invoice_no"]) == ("purchase", "NTS-1")
    assert rows[received_sales.id]["type"] == "sales"  # direction 이 작성목적보다 우선
    assert rows[received_purchase.id]["type"] == "purchase"
    assert (rows[received_purchase.id]["item_name"], rows[received_purchase.id]["supply_amount"]) == ("세금계산서", 0)

    res = client.get("/api/transactions/linkable-tax-invoices?q=매입", headers=h)
    assert [r["id"] for r in res.json()] == [receipt.id]


def test_create_from_tax_invoice_links_document(client, h, db, admin):
    doc = _invoice(db, admin)
    tx = _create(client, h, tax_invoice_doc_id=doc.id)
    db.refresh(doc)
    assert doc.ledger_transaction_id == tx["id"]

    res = client.post("/api/transactions", headers=h, json=_tx(tax_invoice_doc_id=doc.id))
    assert (res.status_code, res.json()["detail"]) == (400, "이미 매입매출에 연결된 세금계산서입니다.")
    quote = _invoice(db, admin, doc_type=ProjectDocType.quotation)
    res = client.post("/api/transactions", headers=h, json=_tx(tax_invoice_doc_id=quote.id))
    assert (res.status_code, res.json()["detail"]) == (400, "불러온 세금계산서를 찾을 수 없습니다.")
    res = client.post("/api/transactions", headers=h, json=_tx(client_id=999_999))
    assert (res.status_code, res.json()["detail"]) == (400, "존재하지 않는 거래처입니다.")


def test_update_cannot_shrink_below_partial_payments(client, h, make_client):
    c = make_client(name="부분상사")
    tx = _create(client, h, client_id=c.id, settled=False)
    pay = client.post(
        "/api/payments",
        headers=h,
        json={
            "type": "deposit",
            "payment_date": "2026-09-20",
            "category": "외상매출금",
            "description": "부분 수금",
            "amount": 50_000,
            "method": "bank_transfer",
            "bank_type": "ibk",
            "client_id": c.id,
            "transaction_id": tx["id"],
        },
    )
    assert pay.status_code == 201, pay.text
    res = client.put(f"/api/transactions/{tx['id']}", headers=h, json=_tx(client_id=c.id, settled=False, supply_amount=40_000, vat_amount=4_000))
    assert res.status_code == 400
    assert "50,000원이 부분 수금/지급되어" in res.json()["detail"]
    got = client.get(f"/api/transactions/{tx['id']}", headers=h).json()
    assert (got["paid_amount"], [p["amount"] for p in got["payment_history"]]) == (50_000, [50_000])
