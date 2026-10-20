"""구매 품의서 → 발주서 작성 → 발송 확인 → 입고 확인 흐름."""
import pytest

from app.models.user import JobTitle, UserRole
from app.services import project_document_files as doc_files
from app.services import proposal_files


@pytest.fixture(autouse=True)
def _no_files(monkeypatch):
    monkeypatch.setattr(proposal_files, "regenerate_pdf", lambda p: None)
    monkeypatch.setattr(doc_files, "regenerate_documents", lambda db, doc: None)


@pytest.fixture()
def staff(make_user):
    return {
        "writer": make_user(name="기안자"),
        "other": make_user(name="다른직원"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


def _proposal(client, headers, kind="구매", final=True, end_title=None, approver_ids=()):
    res = client.post(
        "/api/proposals",
        headers=headers,
        json={"kind": kind, "title": "PCB 구매", "topic": "PCB", "content": "구매", "issue_date": "2026-10-20",
              "is_final_decision": final, "end_title": end_title, "approver_ids": list(approver_ids)},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _order(client, headers, proposal_id, approver_ids=(), final=True):
    res = client.post(
        "/api/project-documents",
        headers=headers,
        json={"project_other_name": "테스트", "doc_type": "purchase_order", "issue_date": "2026-10-20", "client_name": "한솔전자",
              "items": [{"content": "PCB", "quantity": 10, "unit_price": 1000}], "proposal_id": proposal_id,
              "is_final_decision": final, "end_title": None, "approver_ids": list(approver_ids)},
    )
    return res


def test_full_flow(client, staff, auth_headers):
    h = auth_headers(staff["writer"])
    p = _proposal(client, h)
    assert p["status"] == "approved" and p["order_sent_at"] is None and p["received_at"] is None

    # 발주서가 없으면 발송 확인 불가
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True}, headers=h).status_code == 400

    order = _order(client, h, p["id"])
    assert order.status_code == 201, order.text
    assert order.json()["proposal_id"] == p["id"] and order.json()["status"] == "approved"

    # 발송 확인 전에는 입고 불가
    assert client.put(f"/api/proposals/{p['id']}/received", json={"value": True}, headers=h).status_code == 400

    sent = client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True}, headers=h)
    assert sent.status_code == 200 and sent.json()["order_sent_at"] is not None

    got = client.put(f"/api/proposals/{p['id']}/received", json={"value": True}, headers=h)
    assert got.status_code == 200 and got.json()["received_at"] is not None

    # 입고 확인 후에는 발송 확인을 취소할 수 없고, 입고부터 취소해야 한다
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": False}, headers=h).status_code == 400
    assert client.put(f"/api/proposals/{p['id']}/received", json={"value": False}, headers=h).json()["received_at"] is None
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": False}, headers=h).json()["order_sent_at"] is None


def test_order_from_proposal_needs_no_separate_approval(client, staff, auth_headers):
    h = auth_headers(staff["writer"])
    p = _proposal(client, h)
    # 결재선·전결 표시 없이 보내도 품의서 기반 발주서는 바로 확정된다
    res = _order(client, h, p["id"], final=False)
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "approved"
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True}, headers=h).status_code == 200


def test_order_needs_approved_purchase_proposal(client, staff, auth_headers):
    h = auth_headers(staff["writer"])
    non_purchase = _proposal(client, h, kind="출장")
    assert _order(client, h, non_purchase["id"]).status_code == 400  # 구매 품의서가 아님
    assert _order(client, h, 999999).status_code == 400  # 없는 품의서

    pending = _proposal(client, h, final=False, end_title="dept_head", approver_ids=[staff["dept_head"].id])
    assert pending["status"] == "pending"
    assert _order(client, h, pending["id"]).status_code == 400  # 아직 승인 전


def test_only_author_or_admin_can_confirm(client, staff, auth_headers):
    h = auth_headers(staff["writer"])
    p = _proposal(client, h)
    _order(client, h, p["id"])
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True}, headers=auth_headers(staff["other"])).status_code == 403
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True}, headers=auth_headers(staff["ceo"])).status_code == 200


def test_non_purchase_proposal_cannot_use_order_flow(client, staff, auth_headers):
    h = auth_headers(staff["writer"])
    p = _proposal(client, h, kind="출장")
    assert client.put(f"/api/proposals/{p['id']}/order-sent", json={"value": True}, headers=h).status_code == 400
