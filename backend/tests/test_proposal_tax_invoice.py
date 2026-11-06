"""구매 품의서에 세금계산서로 올린 첨부 → 세금계산서 목록 자동 등록, 결재 승인 시 매입 중복 방지."""
import pytest

from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.transaction import Transaction
from app.models.user import UserRole
from app.services import proposal_files


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    from app.config import settings

    monkeypatch.setattr(proposal_files, "regenerate_pdf", lambda p: None)
    monkeypatch.setattr(settings, "proposal_attachments_dir", str(tmp_path / "att"))
    monkeypatch.setattr(settings, "tax_invoice_images_dir", str(tmp_path / "img"))


PDF = b"%PDF-1.7\n" + b"0" * 64


def _purchase(client, h, **over):
    body = {
        "kind": "구매", "title": "소모품 구입", "topic": "소모품", "content": "x", "issue_date": "2026-10-16",
        "vendor_name": "대성RF", "amount": 1000000, "currency": "KRW", "is_final_decision": True,
    }
    body.update(over)
    res = client.post("/api/proposals", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _upload(client, h, pid, kind="tax_invoice", name="계산서.pdf"):
    res = client.post(f"/api/proposals/{pid}/attachments/file", files={"file": (name, PDF, "application/pdf")}, data={"doc_kind": kind}, headers=h)
    assert res.status_code == 201, res.text
    return res.json()


def _docs(db):
    db.expire_all()
    return db.query(ProjectDocument).filter(ProjectDocument.doc_type == ProjectDocType.tax_invoice).all()


def test_tax_invoice_attachment_registers_draft_document(client, db, make_user, auth_headers):
    user = make_user(menu_permissions=["tax_invoice"], name="기안자")
    h = auth_headers(user)
    p = _purchase(client, h)
    body = _upload(client, h, p["id"])
    (doc,) = _docs(db)
    assert doc.status == ProjectDocumentStatus.draft and doc.direction == "purchase" and doc.proposal_id == p["id"]
    assert doc.client_name == "대성RF" and len(doc.images) == 1  # PDF 는 인식하지 않고 품의서 값으로 채운다
    assert [(i.quantity, i.unit_price) for i in doc.items] == [(1, 1000000)]
    assert doc.proposal_attachment_id == body["attachments"][0]["id"]

    # 같은 첨부를 다시 '세금계산서'로 지정해도 중복 등록하지 않는다
    att_id = body["attachments"][0]["id"]
    client.put(f"/api/proposals/{p['id']}/attachments/{att_id}/kind", json={"doc_kind": "tax_invoice"}, headers=h)
    assert len(_docs(db)) == 1
    # 종류를 바꾸면 결재 전 문서는 함께 사라진다
    client.put(f"/api/proposals/{p['id']}/attachments/{att_id}/kind", json={"doc_kind": "statement"}, headers=h)
    assert _docs(db) == []


def test_not_registered_for_other_kinds_or_without_permission(client, db, make_user, auth_headers):
    h = auth_headers(make_user(menu_permissions=["tax_invoice"], name="기안자"))
    p = _purchase(client, h)
    _upload(client, h, p["id"], kind="statement")
    _upload(client, h, p["id"], kind="invoice", name="인보이스.pdf")
    assert _docs(db) == []

    h2 = auth_headers(make_user(name="권한없음"))  # 세금계산서 권한이 없으면 등록하지 않는다
    p2 = _purchase(client, h2)
    _upload(client, h2, p2["id"])
    assert _docs(db) == []


def test_deleting_attachment_removes_draft_document(client, db, make_user, auth_headers):
    h = auth_headers(make_user(menu_permissions=["tax_invoice"], name="기안자"))
    p = _purchase(client, h)
    body = _upload(client, h, p["id"])
    assert len(_docs(db)) == 1
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{body['attachments'][0]['id']}", headers=h).status_code == 200
    assert _docs(db) == []


def test_approved_invoice_links_to_existing_purchase_instead_of_duplicating(client, db, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, name="대표")
    h = auth_headers(admin)
    p = _purchase(client, h)
    assert client.put(f"/api/proposals/{p['id']}/order-sent", headers=h, json={"value": True, "online": True}).status_code == 200
    _upload(client, h, p["id"])
    (doc,) = _docs(db)
    res = client.post(f"/api/project-documents/{doc.id}/request-approval", headers=h, json={"is_final_decision": True, "approver_ids": []})
    assert res.status_code == 200, res.text

    db.expire_all()
    txs = db.query(Transaction).all()
    assert len(txs) == 1 and txs[0].proposal_id == p["id"]  # 품의서의 매입 하나만 있고 세금계산서가 연결된다
    assert db.get(ProjectDocument, doc.id).ledger_transaction_id == txs[0].id
    assert txs[0].tax_invoice_no is not None or doc.approval_no is None

    # 발주를 취소해도 세금계산서가 연결된 매입은 지워지지 않는다
    assert client.put(f"/api/proposals/{p['id']}/order-sent", headers=h, json={"value": False}).status_code == 200
    db.expire_all()
    assert db.query(Transaction).count() == 1


def test_invoice_approved_before_order_is_adopted_by_order(client, db, make_user, auth_headers):
    admin = make_user(role=UserRole.admin, name="대표")
    h = auth_headers(admin)
    p = _purchase(client, h)
    _upload(client, h, p["id"])
    (doc,) = _docs(db)
    assert client.post(f"/api/project-documents/{doc.id}/request-approval", headers=h, json={"is_final_decision": True, "approver_ids": []}).status_code == 200
    db.expire_all()
    assert db.query(Transaction).count() == 1  # 세금계산서가 먼저 승인되어 매입이 생김
    assert client.put(f"/api/proposals/{p['id']}/order-sent", headers=h, json={"value": True, "online": True}).status_code == 200
    db.expire_all()
    (tx,) = db.query(Transaction).all()  # 발주 완료로 같은 매입을 이어받고 두 번째 매입을 만들지 않는다
    assert tx.proposal_id == p["id"]


def test_anyone_can_upload_but_only_uploader_creator_admin_or_chief_can_delete(client, make_user, auth_headers):
    writer, other, third = make_user(name="기안자"), make_user(name="다른직원"), make_user(name="제3직원")
    hw, ho, ht = auth_headers(writer), auth_headers(other), auth_headers(third)
    p = _purchase(client, hw)
    body = _upload(client, ho, p["id"], kind="statement", name="남이올림.pdf")  # 작성자가 아니어도 올릴 수 있다
    att_id = body["attachments"][0]["id"]
    assert client.post(f"/api/proposals/{p['id']}/attachments/link", json={"url": "https://example.com"}, headers=ht).status_code == 201
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{att_id}", headers=ht).status_code == 403  # 상관없는 사람은 지울 수 없다
    assert client.put(f"/api/proposals/{p['id']}/attachments/{att_id}/kind", json={"doc_kind": "invoice"}, headers=ht).status_code == 403
    assert client.put(f"/api/proposals/{p['id']}/attachments/{att_id}/kind", json={"doc_kind": "invoice"}, headers=ho).status_code == 200  # 올린 사람
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{att_id}", headers=hw).status_code == 200  # 품의서 작성자


def test_chief_can_delete_others_attachment(client, make_user, auth_headers, db):
    from app.models.user import JobGrade

    writer, chief = make_user(name="기안자"), make_user(name="소장님")
    chief.grade = JobGrade.chief
    db.commit()
    hw, hc = auth_headers(writer), auth_headers(chief)
    p = _purchase(client, hw)
    att_id = _upload(client, hw, p["id"], kind="statement")["attachments"][0]["id"]
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{att_id}", headers=hc).status_code == 200


def test_dept_head_and_ceo_can_delete_but_team_lead_cannot(client, make_user, auth_headers):
    from app.models.user import JobTitle

    writer = make_user(name="기안자")
    dept, ceo, team = make_user(title=JobTitle.dept_head, name="부서장"), make_user(title=JobTitle.ceo, name="대표"), make_user(title=JobTitle.team_lead, name="팀장")
    hw = auth_headers(writer)
    p = _purchase(client, hw)

    def new_att():
        return _upload(client, hw, p["id"], kind="statement", name="a.pdf")["attachments"][-1]["id"]

    a1 = new_att()
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{a1}", headers=auth_headers(team)).status_code == 403  # 직책 순서: 팀장 < 부서장 < 대표
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{a1}", headers=auth_headers(dept)).status_code == 200
    a2 = new_att()
    assert client.delete(f"/api/proposals/{p['id']}/attachments/{a2}", headers=auth_headers(ceo)).status_code == 200
