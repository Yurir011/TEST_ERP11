"""모바일 결재 화면의 [처리 내역]: 내가 승인·반려한 결재만, 최근 처리 순으로 돌려준다."""
import pytest

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
        "writer": make_user(menu_permissions=["projects"], name="작성자"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "team_lead": make_user(title=JobTitle.team_lead, name="팀장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


def _leave(client, headers, approver_ids, **extra):
    body = {"start_date": "2026-12-14", "end_date": "2026-12-15", "reason": "테스트", "end_title": "dept_head", "approver_ids": approver_ids, **extra}
    res = client.post("/api/leaves", headers=headers, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _proposal(client, headers, approver_ids):
    res = client.post(
        "/api/proposals",
        headers=headers,
        json={"title": "장비 구매", "topic": "계측기", "content": "구매", "issue_date": "2026-11-04", "is_final_decision": False, "end_title": "dept_head", "approver_ids": approver_ids},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_history_lists_only_my_decisions_newest_first(client, staff, auth_headers):
    writer_h, head_h = auth_headers(staff["writer"]), auth_headers(staff["dept_head"])
    ids = [staff["dept_head"].id]
    leave = _leave(client, writer_h, ids)
    proposal = _proposal(client, writer_h, ids)
    pending = _leave(client, writer_h, ids, start_date="2026-12-21", end_date="2026-12-21")  # 아직 처리 전

    assert client.put(f"/api/leaves/{leave['id']}/approve", headers=head_h).status_code == 200
    assert client.put(f"/api/proposals/{proposal['id']}/reject", headers=head_h, json={"reason": "예산 초과"}).status_code == 200

    res = client.get("/api/approvals/history", headers=head_h)
    assert res.status_code == 200, res.text
    rows = res.json()
    assert [(r["kind"], r["id"], r["result"]) for r in rows] == [("proposal", proposal["id"], "rejected"), ("leave", leave["id"], "approved")]
    assert rows[0]["kind_label"] == "품의서" and rows[0]["title"] == "장비 구매" and "작성자" in rows[0]["subtitle"]
    assert rows[1]["kind_label"] == "연차" and rows[1]["doc_status"] == "approved"
    assert pending["id"] not in [r["id"] for r in rows if r["kind"] == "leave"]

    # 다른 사람의 처리 내역에는 보이지 않는다.
    assert client.get("/api/approvals/history", headers=writer_h).json() == []


def test_history_excludes_self_approved_steps_and_withdrawn(client, staff, auth_headers):
    head_h = auth_headers(staff["dept_head"])
    # 부서장이 자기 자신을 결재권자로 올린 연차: 자동 승인된 단계는 "내가 처리한 결재"가 아니다.
    own = _leave(client, head_h, [staff["dept_head"].id, staff["team_lead"].id], end_title="team_lead")
    assert own["steps"][0]["status"] == "approved"
    assert client.get("/api/approvals/history", headers=head_h).json() == []

    # 작성자가 회수하면 결재선이 지워져 내역에서도 사라진다.
    writer_h = auth_headers(staff["writer"])
    leave = _leave(client, writer_h, [staff["dept_head"].id])
    client.put(f"/api/leaves/{leave['id']}/approve", headers=head_h)
    assert len(client.get("/api/approvals/history", headers=head_h).json()) == 1


def test_history_requires_login(client):
    assert client.get("/api/approvals/history").status_code in (401, 403)
