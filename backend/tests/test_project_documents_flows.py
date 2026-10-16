"""문서관리(project_documents) 특성화 테스트 — 라우터 분할 전 안전망.

고정하는 것: API 경로 목록, 세금계산서 승인 → 매입매출 자동 기록(재승인 갱신 포함), 견적서+거래명세서 묶음 처리,
삭제 결재(승인 시 삭제 / 반려 시 복원), 반려 문서 재요청, 수정·삭제 가능 조건.
PDF·엑셀 파일 생성은 대상이 아니므로 만들지 않도록 대체한다.
"""
import pytest

from app.main import app
from app.models.project_document import ProjectDocument
from app.models.transaction import Transaction, TransactionType
from app.models.user import JobTitle, UserRole
from app.services import project_document_files as doc_files


@pytest.fixture(autouse=True)
def _no_file_generation(monkeypatch):
    monkeypatch.setattr(doc_files, "regenerate_documents", lambda db, doc: None)


@pytest.fixture()
def staff(make_user):
    return {
        "writer": make_user(menu_permissions=["projects", "tax_invoice"], name="작성자"),
        "other": make_user(menu_permissions=["projects"], name="다른직원"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "team_lead": make_user(title=JobTitle.team_lead, name="팀장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


ITEM = {"content": "품목", "quantity": 1, "unit_price": 1_000_000}


def _payload(doc_type="quotation", purpose="청구", items=None, approver_ids=(), end_title="dept_head", **extra):
    return {
        "project_id": None,
        "project_other_name": "테스트 프로젝트",
        "doc_type": doc_type,
        "issue_date": "2026-10-16",
        "purpose_type": purpose,
        "client_name": "테스트 거래처",
        "items": items or [ITEM],
        "end_title": end_title,
        "approver_ids": list(approver_ids),
        **extra,
    }


def _create(client, headers, **kw):
    res = client.post("/api/project-documents", headers=headers, json=_payload(**kw))
    assert res.status_code == 201, res.text
    return res.json()


def _approve(client, headers, doc_id):
    res = client.put(f"/api/project-documents/{doc_id}/approve", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _ledger_txs(db, doc_id):
    return db.query(Transaction).filter(Transaction.memo.like(f"%project_document_id={doc_id})%")).all()


# ── API 경로 목록 (분할 전후 같아야 한다) ──────────────────────────

EXPECTED_OPERATIONS = [
    ("DELETE", "/api/project-documents/{doc_id}", ["204", "422"]),
    ("DELETE", "/api/project-documents/{doc_id}/images/{image_id}", ["200", "422"]),
    ("GET", "/api/project-documents", ["200", "422"]),
    ("GET", "/api/project-documents/export/tax-invoices-excel", ["200", "422"]),
    ("GET", "/api/project-documents/{doc_id}/excel", ["200", "422"]),
    ("GET", "/api/project-documents/{doc_id}/images/{image_id}", ["200", "422"]),
    ("GET", "/api/project-documents/{doc_id}/pdf", ["200", "422"]),
    ("GET", "/api/project-documents/{doc_id}/popbill/pdf-url", ["200", "422"]),
    ("GET", "/api/project-documents/{doc_id}/popbill/required-info", ["200", "422"]),
    ("GET", "/api/project-documents/{doc_id}/popbill/view-url", ["200", "422"]),
    ("POST", "/api/project-documents", ["201", "422"]),
    ("POST", "/api/project-documents/ocr/tax-invoice", ["200", "422"]),
    ("POST", "/api/project-documents/set", ["201", "422"]),
    ("POST", "/api/project-documents/{doc_id}/images", ["201", "422"]),
    ("POST", "/api/project-documents/{doc_id}/popbill/issue", ["200", "422"]),
    ("POST", "/api/project-documents/{doc_id}/request-approval", ["200", "422"]),
    ("POST", "/api/project-documents/{doc_id}/request-delete", ["200", "422"]),
    ("PUT", "/api/project-documents/{doc_id}", ["200", "422"]),
    ("PUT", "/api/project-documents/{doc_id}/approve", ["200", "422"]),
    ("PUT", "/api/project-documents/{doc_id}/reject", ["200", "422"]),
]


def test_api_operations_are_unchanged():
    spec = app.openapi()
    actual = []
    for path, ops in spec["paths"].items():
        if not path.startswith("/api/project-documents"):
            continue
        for method, op in ops.items():
            actual.append((method.upper(), path, sorted(op["responses"].keys())))
    assert sorted(actual) == sorted(EXPECTED_OPERATIONS)


# ── 세금계산서 승인 → 매입매출 자동 기록 ────────────────────────────

def test_tax_invoice_approval_creates_sales_transaction(client, db, staff, auth_headers):
    doc = _create(client, auth_headers(staff["writer"]), doc_type="tax_invoice", approver_ids=[staff["dept_head"].id])
    assert doc["status"] == "pending"
    assert _ledger_txs(db, doc["id"]) == []  # 승인 전에는 기록하지 않는다

    assert _approve(client, auth_headers(staff["dept_head"]), doc["id"])["status"] == "approved"

    txs = _ledger_txs(db, doc["id"])
    assert len(txs) == 1
    tx = txs[0]
    assert tx.type == TransactionType.sales  # 청구 → 매출
    assert (tx.supply_amount, tx.vat_amount, tx.total_amount) == (1_000_000, 100_000, 1_100_000)
    assert tx.settled is False  # 항상 외상으로 기록
    row = db.get(ProjectDocument, doc["id"])
    db.refresh(row)
    assert row.ledger_transaction_id == tx.id


def test_tax_invoice_receipt_purpose_creates_purchase_transaction(client, db, staff, auth_headers):
    doc = _create(
        client, auth_headers(staff["writer"]), doc_type="tax_invoice", purpose="영수", approver_ids=[staff["dept_head"].id]
    )
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    tx = _ledger_txs(db, doc["id"])[0]
    assert tx.type == TransactionType.purchase  # 영수 → 매입


def test_non_tax_invoice_approval_does_not_touch_ledger(client, db, staff, auth_headers):
    doc = _create(client, auth_headers(staff["writer"]), approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    assert _ledger_txs(db, doc["id"]) == []


def test_edit_approved_tax_invoice_and_reapprove_updates_same_transaction(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = _create(client, writer_h, doc_type="tax_invoice", approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])

    # 승인된 문서는 수정 후 반드시 결재를 다시 요청해야 한다
    body = {
        "issue_date": "2026-10-17",
        "purpose_type": "청구",
        "client_name": "테스트 거래처",
        "items": [{"content": "품목", "quantity": 1, "unit_price": 2_000_000}],
    }
    no_resubmit = client.put(f"/api/project-documents/{doc['id']}", headers=writer_h, json=body)
    assert no_resubmit.status_code == 400

    res = client.put(
        f"/api/project-documents/{doc['id']}",
        headers=writer_h,
        json={**body, "request_approval": True, "end_title": "dept_head", "approver_ids": [staff["dept_head"].id]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "pending"

    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    txs = _ledger_txs(db, doc["id"])
    assert len(txs) == 1  # 새로 만들지 않고 기존 내역을 고친다
    db.refresh(txs[0])
    assert txs[0].supply_amount == 2_000_000
    assert txs[0].total_amount == 2_200_000


# ── 견적서 + 거래명세서 묶음 ───────────────────────────────────────

def _create_set(client, headers, approver_ids):
    res = client.post("/api/project-documents/set", headers=headers, json=_payload(approver_ids=approver_ids))
    assert res.status_code == 201, res.text
    return res.json()


def test_set_is_created_as_quotation_and_statement_pair(client, staff, auth_headers):
    docs = _create_set(client, auth_headers(staff["writer"]), [staff["dept_head"].id])
    assert [d["doc_type"] for d in docs] == ["quotation", "statement"]
    assert docs[0]["set_id"] == docs[1]["set_id"] is not None


def test_set_approval_processes_both_documents(client, db, staff, auth_headers):
    docs = _create_set(client, auth_headers(staff["writer"]), [staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), docs[0]["id"])  # 견적서만 승인해도
    for d in docs:
        row = db.get(ProjectDocument, d["id"])
        db.refresh(row)
        assert row.status.value == "approved"  # 거래명세서도 함께 승인된다


def test_set_rejection_processes_both_documents(client, db, staff, auth_headers):
    docs = _create_set(client, auth_headers(staff["writer"]), [staff["dept_head"].id])
    res = client.put(
        f"/api/project-documents/{docs[0]['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "단가"}
    )
    assert res.status_code == 200, res.text
    for d in docs:
        row = db.get(ProjectDocument, d["id"])
        db.refresh(row)
        assert row.status.value == "rejected"
        assert row.reject_reason == "단가"


def test_set_members_cannot_be_edited_individually(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    docs = _create_set(client, writer_h, [staff["dept_head"].id])
    client.put(f"/api/project-documents/{docs[0]['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "x"})
    res = client.put(
        f"/api/project-documents/{docs[0]['id']}",
        headers=writer_h,
        json={"issue_date": "2026-10-16", "client_name": "거래처", "items": [ITEM]},
    )
    assert res.status_code == 400


# ── 삭제 결재 ─────────────────────────────────────────────────────

def _request_delete(client, headers, doc_id, approver_ids, end_title="dept_head"):
    return client.post(
        f"/api/project-documents/{doc_id}/request-delete",
        headers=headers,
        json={"end_title": end_title, "approver_ids": approver_ids},
    )


def test_delete_request_final_approval_removes_document_and_ledger(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = _create(client, writer_h, doc_type="tax_invoice", approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    assert len(_ledger_txs(db, doc["id"])) == 1

    res = _request_delete(client, writer_h, doc["id"], [staff["dept_head"].id])
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "pending" and res.json()["delete_requested"] is True

    _approve(client, auth_headers(staff["dept_head"]), doc["id"])  # 삭제 결재 최종 승인
    assert db.query(ProjectDocument).filter(ProjectDocument.id == doc["id"]).count() == 0
    assert _ledger_txs(db, doc["id"]) == []  # 연결된 매입매출도 함께 삭제


def test_delete_with_partial_payment_removes_partial_payments_too(client, db, staff, auth_headers, make_client):
    """R5: 부분 결제된 세금계산서를 삭제 결재로 지우면 부분 결제 입출금도 함께 지워야 한다.
    남겨 두면 연결 없는 잔액 정산으로 취급되어, 나중에 그 입출금을 지울 때 미수금이 되살아난다."""
    from app.models.client import Client
    from app.models.payment import Payment

    c = make_client(name="테스트 거래처")  # 문서의 거래처명과 같은 이름 → 매입매출이 이 거래처로 기록된다
    writer_h, ceo_h = auth_headers(staff["writer"]), auth_headers(staff["ceo"])
    doc = _create(client, writer_h, doc_type="tax_invoice", approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    tx = _ledger_txs(db, doc["id"])[0]
    assert tx.client_id == c.id
    pay = client.post(
        "/api/payments",
        headers=ceo_h,
        json={"type": "deposit", "payment_date": "2026-10-16", "category": "외상매출금", "description": "일부 수금",
              "amount": 400_000, "method": "bank_transfer", "bank_type": "ibk", "client_id": c.id, "transaction_id": tx.id},
    )
    assert pay.status_code == 201, pay.text
    db.refresh(c)
    assert c.receivable_amount == 700_000

    _request_delete(client, writer_h, doc["id"], [staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])  # 삭제 결재 최종 승인
    db.expire_all()
    assert db.get(Payment, pay.json()["id"]) is None  # 부분 결제 입출금도 함께 삭제
    assert db.get(Client, c.id).receivable_amount == 0


def test_delete_request_rejection_restores_approved_state(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = _create(client, writer_h, approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    _request_delete(client, writer_h, doc["id"], [staff["dept_head"].id])

    rej = client.put(
        f"/api/project-documents/{doc['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "보류"}
    )
    assert rej.status_code == 200, rej.text
    row = db.get(ProjectDocument, doc["id"])
    db.refresh(row)
    assert row.status.value == "approved"
    assert row.delete_requested is False


def test_delete_request_requires_approved_document(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = _create(client, writer_h, approver_ids=[staff["dept_head"].id])  # 아직 결재 대기
    assert _request_delete(client, writer_h, doc["id"], [staff["dept_head"].id]).status_code == 400


def test_delete_request_only_by_creator_or_admin(client, staff, auth_headers):
    doc = _create(client, auth_headers(staff["writer"]), approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), doc["id"])
    assert _request_delete(client, auth_headers(staff["other"]), doc["id"], [staff["dept_head"].id]).status_code == 403


# ── 재요청 · 수정 · 삭제 조건 ────────────────────────────────────────

def test_rejected_document_can_be_resubmitted(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = _create(client, writer_h, approver_ids=[staff["dept_head"].id])
    client.put(f"/api/project-documents/{doc['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "수정 필요"})

    res = client.post(
        f"/api/project-documents/{doc['id']}/request-approval",
        headers=writer_h,
        json={"end_title": "dept_head", "approver_ids": [staff["dept_head"].id]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "pending"


def test_request_approval_only_by_creator_and_only_draft_or_rejected(client, staff, auth_headers):
    doc = _create(client, auth_headers(staff["writer"]), approver_ids=[staff["dept_head"].id])  # 결재 대기 상태
    body = {"end_title": "dept_head", "approver_ids": [staff["dept_head"].id]}
    assert client.post(f"/api/project-documents/{doc['id']}/request-approval", headers=auth_headers(staff["writer"]), json=body).status_code == 400
    assert client.post(f"/api/project-documents/{doc['id']}/request-approval", headers=auth_headers(staff["other"]), json=body).status_code == 403


def test_update_conditions(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    body = {"issue_date": "2026-10-16", "client_name": "거래처", "items": [ITEM]}
    doc = _create(client, writer_h, approver_ids=[staff["dept_head"].id])  # 결재 대기

    assert client.put(f"/api/project-documents/{doc['id']}", headers=writer_h, json=body).status_code == 400  # 대기 중 수정 불가
    assert client.put(f"/api/project-documents/{doc['id']}", headers=auth_headers(staff["other"]), json=body).status_code == 403  # 작성자만

    client.put(f"/api/project-documents/{doc['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "x"})
    assert client.put(f"/api/project-documents/{doc['id']}", headers=writer_h, json=body).status_code == 200  # 반려 후에는 수정 가능


def test_delete_conditions(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    pending = _create(client, writer_h, approver_ids=[staff["dept_head"].id])
    assert client.delete(f"/api/project-documents/{pending['id']}", headers=writer_h).status_code == 204  # 미승인은 바로 삭제

    approved = _create(client, writer_h, approver_ids=[staff["dept_head"].id])
    _approve(client, auth_headers(staff["dept_head"]), approved["id"])
    assert client.delete(f"/api/project-documents/{approved['id']}", headers=writer_h).status_code == 400  # 승인된 문서는 삭제 결재 필요
    assert db.query(ProjectDocument).filter(ProjectDocument.id == approved["id"]).count() == 1


def test_tax_invoice_creation_requires_permission(client, staff, auth_headers):
    res = client.post(
        "/api/project-documents",
        headers=auth_headers(staff["other"]),  # tax_invoice 메뉴 권한 없음
        json=_payload(doc_type="tax_invoice", approver_ids=[staff["dept_head"].id]),
    )
    assert res.status_code == 403
