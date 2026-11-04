"""결재 회수(승인 전 되돌리기) 테스트: 연차·증명서·품의서·프로젝트 문서(견적서 등).

회수 규칙: 결재 대기 중이고, 다른 결재자가 아직 아무도 승인하지 않았을 때만 작성자가 회수할 수 있다.
PDF·엑셀 파일 생성은 대상이 아니므로 만들지 않도록 대체한다.
"""
import pytest

from app.models.approval_step import ApprovalStep
from app.models.notification import Notification
from app.models.user import JobTitle, UserRole
from app.routers import documents as documents_router
from app.services import project_document_files as doc_files
from app.services import proposal_files


@pytest.fixture(autouse=True)
def _no_file_generation(monkeypatch):
    monkeypatch.setattr(documents_router, "_issue_pdf", lambda record, user: None)
    monkeypatch.setattr(doc_files, "regenerate_documents", lambda db, doc: None)
    monkeypatch.setattr(proposal_files, "regenerate_pdf", lambda p: None)


@pytest.fixture()
def staff(make_user):
    return {
        "writer": make_user(menu_permissions=["projects", "tax_invoice"], name="작성자"),
        "other": make_user(menu_permissions=["projects"], name="다른직원"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "team_lead": make_user(title=JobTitle.team_lead, name="팀장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


def _step_rows(db, target_type, target_id) -> int:
    return (
        db.query(ApprovalStep)
        .filter(ApprovalStep.target_type == target_type, ApprovalStep.target_id == target_id)
        .count()
    )


def _chain(staff):
    return [staff["dept_head"].id, staff["team_lead"].id]


# ── 연차 ──────────────────────────────────────────────────────────

def _leave_body(approver_ids, **extra):
    return {
        "start_date": "2026-12-14",
        "end_date": "2026-12-15",
        "reason": "테스트 연차",
        "end_title": "team_lead",
        "approver_ids": approver_ids,
        **extra,
    }


def test_leave_withdraw_then_resubmit(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    leave = client.post("/api/leaves", headers=writer_h, json=_leave_body(_chain(staff))).json()

    res = client.post(f"/api/leaves/{leave['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "withdrawn" and body["steps"] == [] and body["approver_id"] is None
    assert _step_rows(db, "leave", leave["id"]) == 0
    # 결재 대기 중이던 결재자에게 회수 알림이 간다.
    assert db.query(Notification).filter(Notification.user_id == staff["dept_head"].id, Notification.title.like("%결재 회수")).count() == 1
    # 회수한 건은 결재자가 더 이상 처리할 수 없다.
    assert client.put(f"/api/leaves/{leave['id']}/approve", headers=auth_headers(staff["dept_head"])).status_code in (400, 403)

    again = client.put(
        f"/api/leaves/{leave['id']}",
        headers=writer_h,
        json=_leave_body(_chain(staff), start_date="2026-12-16", end_date="2026-12-16", reason="수정한 사유"),
    )
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "pending" and again.json()["days"] == 1 and again.json()["reason"] == "수정한 사유"
    assert len(again.json()["steps"]) == 2


def test_leave_withdraw_then_discard(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    leave = client.post("/api/leaves", headers=writer_h, json=_leave_body(_chain(staff))).json()
    client.post(f"/api/leaves/{leave['id']}/withdraw", headers=writer_h)
    assert client.delete(f"/api/leaves/{leave['id']}", headers=writer_h).status_code == 204
    assert client.get(f"/api/leaves/{leave['id']}", headers=writer_h).status_code == 404


def test_leave_cannot_withdraw_after_other_approver_approved_or_by_others(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    leave = client.post("/api/leaves", headers=writer_h, json=_leave_body(_chain(staff))).json()
    assert client.post(f"/api/leaves/{leave['id']}/withdraw", headers=auth_headers(staff["other"])).status_code == 404
    client.put(f"/api/leaves/{leave['id']}/approve", headers=auth_headers(staff["dept_head"]))
    res = client.post(f"/api/leaves/{leave['id']}/withdraw", headers=writer_h)
    assert res.status_code == 400 and "회수할 수 없습니다" in res.json()["detail"]
    # 승인 대기 상태가 아니면(이미 회수한 건) 다시 회수할 수 없다.
    other = client.post("/api/leaves", headers=writer_h, json=_leave_body(_chain(staff), start_date="2026-12-21", end_date="2026-12-21")).json()
    client.post(f"/api/leaves/{other['id']}/withdraw", headers=writer_h)
    assert client.post(f"/api/leaves/{other['id']}/withdraw", headers=writer_h).status_code == 400


def test_leave_self_approved_step_does_not_block_withdraw(client, staff, auth_headers):
    """기안자 본인이 1단계 결재권자라 자동 승인된 경우에도, 다른 사람이 승인한 게 아니므로 회수할 수 있다."""
    dept_head_h = auth_headers(staff["dept_head"])
    body = _leave_body(_chain(staff))
    leave = client.post("/api/leaves", headers=dept_head_h, json=body).json()
    assert leave["steps"][0]["status"] == "approved" and leave["status"] == "pending"
    res = client.post(f"/api/leaves/{leave['id']}/withdraw", headers=dept_head_h)
    assert res.status_code == 200 and res.json()["status"] == "withdrawn"


# ── 재직/경력증명서 ──────────────────────────────────────────────────

def _cert_body(approver_ids, **extra):
    return {"doc_type": "employment", "purpose": "은행 제출", "end_title": "team_lead", "approver_ids": approver_ids, **extra}


def test_certificate_withdraw_resubmit_and_discard(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = client.post("/api/documents/request", headers=writer_h, json=_cert_body(_chain(staff))).json()

    assert client.post(f"/api/documents/{doc['id']}/withdraw", headers=auth_headers(staff["other"])).status_code == 403
    res = client.post(f"/api/documents/{doc['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "withdrawn" and res.json()["steps"] == []
    assert _step_rows(db, "document", doc["id"]) == 0
    assert client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"])).status_code in (400, 403)

    again = client.put(
        f"/api/documents/{doc['id']}", headers=writer_h, json=_cert_body(_chain(staff), doc_type="career", purpose="수정한 용도")
    )
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "pending" and again.json()["doc_type"] == "career" and again.json()["purpose"] == "수정한 용도"

    # 대기 중에는 폐기할 수 없고, 회수한 뒤에만 폐기할 수 있다.
    assert client.delete(f"/api/documents/{doc['id']}", headers=writer_h).status_code == 400
    client.post(f"/api/documents/{doc['id']}/withdraw", headers=writer_h)
    assert client.delete(f"/api/documents/{doc['id']}", headers=writer_h).status_code == 204
    assert client.get(f"/api/documents/{doc['id']}", headers=writer_h).status_code == 404


def test_certificate_cannot_withdraw_after_approval_started(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = client.post("/api/documents/request", headers=writer_h, json=_cert_body(_chain(staff))).json()
    client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert client.post(f"/api/documents/{doc['id']}/withdraw", headers=writer_h).status_code == 400


# ── 품의서 ────────────────────────────────────────────────────────

def _proposal_body(approver_ids, end_title="team_lead", **extra):
    return {
        "title": "장비 구매", "topic": "계측기", "content": "구매 요청", "issue_date": "2026-10-16",
        "is_final_decision": False, "end_title": end_title, "approver_ids": approver_ids, **extra,
    }


def test_proposal_withdraw_edit_resubmit(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = client.post("/api/proposals", headers=writer_h, json=_proposal_body(_chain(staff))).json()

    res = client.post(f"/api/proposals/{p['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "withdrawn" and res.json()["steps"] == []
    assert _step_rows(db, "proposal", p["id"]) == 0
    assert client.put(f"/api/proposals/{p['id']}/approve", headers=auth_headers(staff["dept_head"])).status_code in (400, 403)

    edited = client.put(f"/api/proposals/{p['id']}", headers=writer_h, json=_proposal_body(_chain(staff), title="수정한 제목"))
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "pending" and edited.json()["title"] == "수정한 제목" and len(edited.json()["steps"]) == 2


def test_proposal_withdraw_then_delete(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = client.post("/api/proposals", headers=writer_h, json=_proposal_body(_chain(staff))).json()
    client.post(f"/api/proposals/{p['id']}/withdraw", headers=writer_h)
    assert client.delete(f"/api/proposals/{p['id']}", headers=writer_h).status_code == 204


def test_proposal_withdraw_rules(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = client.post("/api/proposals", headers=writer_h, json=_proposal_body(_chain(staff))).json()
    assert client.post(f"/api/proposals/{p['id']}/withdraw", headers=auth_headers(staff["other"])).status_code == 403
    client.put(f"/api/proposals/{p['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert client.post(f"/api/proposals/{p['id']}/withdraw", headers=writer_h).status_code == 400


def test_proposal_delete_request_withdraw_restores_approved(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = client.post("/api/proposals", headers=writer_h, json=_proposal_body([staff["dept_head"].id], end_title="dept_head")).json()
    client.put(f"/api/proposals/{p['id']}/approve", headers=auth_headers(staff["dept_head"]))
    client.post(
        f"/api/proposals/{p['id']}/request-delete", headers=writer_h, json={"end_title": "dept_head", "approver_ids": [staff["dept_head"].id]}
    )
    res = client.post(f"/api/proposals/{p['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved" and body["delete_requested"] is False
    assert [s["status"] for s in body["steps"]] == ["approved"]


# ── 프로젝트 문서(견적서·거래명세서·세금계산서·발주서) ───────────────────

_ITEM = {"content": "품목", "quantity": 1, "unit_price": 1_000_000}


def _doc_body(approver_ids, doc_type="quotation", end_title="team_lead", **extra):
    return {
        "project_id": None, "project_other_name": "테스트 프로젝트", "doc_type": doc_type, "issue_date": "2026-10-16",
        "purpose_type": "청구", "client_name": "테스트 거래처", "items": [_ITEM], "end_title": end_title,
        "approver_ids": approver_ids, **extra,
    }


def test_project_document_withdraw_returns_to_draft_and_can_resubmit(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = client.post("/api/project-documents", headers=writer_h, json=_doc_body(_chain(staff))).json()
    assert doc["status"] == "pending"

    res = client.post(f"/api/project-documents/{doc['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "draft" and res.json()["steps"] == []
    assert _step_rows(db, "project_document", doc["id"]) == 0
    assert client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"])).status_code in (400, 403)

    # 작성 중으로 돌아왔으므로 수정 후 다시 결재를 요청할 수 있다.
    again = client.post(
        f"/api/project-documents/{doc['id']}/request-approval",
        headers=writer_h,
        json={"end_title": "team_lead", "approver_ids": _chain(staff)},
    )
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "pending" and len(again.json()["steps"]) == 2


def test_project_document_withdraw_rules(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = client.post("/api/project-documents", headers=writer_h, json=_doc_body(_chain(staff))).json()
    assert client.post(f"/api/project-documents/{doc['id']}/withdraw", headers=auth_headers(staff["other"])).status_code == 403
    client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert client.post(f"/api/project-documents/{doc['id']}/withdraw", headers=writer_h).status_code == 400
    # 이미 회수해 작성 중인 문서는 다시 회수할 것이 없다.
    other = client.post("/api/project-documents", headers=writer_h, json=_doc_body(_chain(staff))).json()
    assert client.post(f"/api/project-documents/{other['id']}/withdraw", headers=writer_h).status_code == 200
    assert client.post(f"/api/project-documents/{other['id']}/withdraw", headers=writer_h).status_code == 400


def test_project_document_set_is_withdrawn_together(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    docs = client.post("/api/project-documents/set", headers=writer_h, json=_doc_body(_chain(staff))).json()
    assert len(docs) == 2
    res = client.post(f"/api/project-documents/{docs[0]['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    listed = {d["id"]: d["status"] for d in client.get("/api/project-documents", headers=writer_h).json()}
    assert [listed[d["id"]] for d in docs] == ["draft", "draft"]


def test_project_document_delete_request_withdraw_restores_approved(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    doc = client.post("/api/project-documents", headers=writer_h, json=_doc_body([staff["dept_head"].id], end_title="dept_head")).json()
    client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    client.post(
        f"/api/project-documents/{doc['id']}/request-delete", headers=writer_h,
        json={"end_title": "dept_head", "approver_ids": [staff["dept_head"].id]},
    )
    res = client.post(f"/api/project-documents/{doc['id']}/withdraw", headers=writer_h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved" and res.json()["delete_requested"] is False
