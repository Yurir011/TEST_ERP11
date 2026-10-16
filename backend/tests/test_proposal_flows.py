"""품의서 결재 특성화 테스트 — 결재 단계 테이블 통합(09 문서) 전후에 모두 통과해야 한다.

결재 단계가 어느 테이블에 저장되는지와 무관하게 API 응답과 동작만 확인한다.
PDF 파일 생성은 대상이 아니므로 만들지 않도록 대체한다.
"""
import pytest
from sqlalchemy import text

from app.models.proposal import Proposal
from app.models.user import JobTitle, UserRole
from app.routers import proposals as proposals_router


@pytest.fixture(autouse=True)
def _no_pdf(monkeypatch):
    monkeypatch.setattr(proposals_router, "_regenerate_pdf", lambda p: None)


@pytest.fixture()
def staff(make_user):
    return {
        "writer": make_user(name="기안자"),
        "other": make_user(name="다른직원"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "team_lead": make_user(title=JobTitle.team_lead, name="팀장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


def _create(client, headers, approver_ids=(), end_title="team_lead", final=False):
    res = client.post(
        "/api/proposals",
        headers=headers,
        json={
            "title": "장비 구매", "topic": "계측기", "content": "구매 요청", "issue_date": "2026-10-16",
            "is_final_decision": final, "end_title": None if final else end_title, "approver_ids": list(approver_ids),
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _approve(client, headers, pid):
    return client.put(f"/api/proposals/{pid}/approve", headers=headers)


def _step_rows(db, proposal_id) -> int:
    """결재 단계 행 수 (예전 전용 테이블 + 공용 테이블 합계 — 어느 쪽에 저장되든 같은 의미)."""
    old = db.execute(text("SELECT count(*) FROM proposal_approval_steps WHERE proposal_id = :i"), {"i": proposal_id}).scalar()
    new = db.execute(
        text("SELECT count(*) FROM approval_steps WHERE target_type::text = 'proposal' AND target_id = :i"), {"i": proposal_id}
    ).scalar()
    return old + new


def test_two_step_approval_and_steps_shape(client, staff, auth_headers):
    p = _create(client, auth_headers(staff["writer"]), [staff["dept_head"].id, staff["team_lead"].id])
    assert p["status"] == "pending" and p["current_step"] == 1
    assert [(s["step_order"], s["title"], s["approver_id"], s["approver_name"], s["status"]) for s in p["steps"]] == [
        (1, "dept_head", staff["dept_head"].id, "부서장", "pending"),
        (2, "team_lead", staff["team_lead"].id, "팀장", "pending"),
    ]

    assert _approve(client, auth_headers(staff["team_lead"]), p["id"]).status_code == 403  # 아직 차례 아님

    first = _approve(client, auth_headers(staff["dept_head"]), p["id"])
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "pending" and body["current_step"] == 2
    assert body["steps"][0]["status"] == "approved" and body["steps"][0]["decided_at"] is not None

    last = _approve(client, auth_headers(staff["team_lead"]), p["id"]).json()
    assert last["status"] == "approved"
    assert [s["status"] for s in last["steps"]] == ["approved", "approved"]

    again = _approve(client, auth_headers(staff["team_lead"]), p["id"])
    assert again.status_code == 400


def test_reject(client, staff, auth_headers):
    p = _create(client, auth_headers(staff["writer"]), [staff["dept_head"].id, staff["team_lead"].id])
    res = client.put(f"/api/proposals/{p['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "예산 초과"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "rejected" and body["reject_reason"] == "예산 초과"
    assert [s["status"] for s in body["steps"]] == ["rejected", "pending"]
    assert _approve(client, auth_headers(staff["team_lead"]), p["id"]).status_code == 400


def test_final_decision_is_approved_immediately_without_steps(client, staff, auth_headers):
    p = _create(client, auth_headers(staff["writer"]), final=True)
    assert p["status"] == "approved" and p["is_final_decision"] is True and p["steps"] == []


def test_self_approval_skips_own_steps(client, staff, auth_headers):
    # 부서장이 기안하고 자기 자신이 1단계 결재자 → 1단계는 즉시 승인, 팀장 차례
    p = _create(client, auth_headers(staff["dept_head"]), [staff["dept_head"].id, staff["team_lead"].id])
    assert p["status"] == "pending" and p["current_step"] == 2
    assert [s["status"] for s in p["steps"]] == ["approved", "pending"]

    only_self = _create(client, auth_headers(staff["dept_head"]), [staff["dept_head"].id], end_title="dept_head")
    assert only_self["status"] == "approved"


def test_my_inbox_lists_only_current_step_approver(client, staff, auth_headers):
    p = _create(client, auth_headers(staff["writer"]), [staff["dept_head"].id, staff["team_lead"].id])
    mine = lambda u: [x["id"] for x in client.get("/api/proposals?status=pending&approver_mine=true", headers=auth_headers(u)).json()]  # noqa: E731
    assert p["id"] in mine(staff["dept_head"])
    assert p["id"] not in mine(staff["team_lead"])
    _approve(client, auth_headers(staff["dept_head"]), p["id"])
    assert p["id"] not in mine(staff["dept_head"])
    assert p["id"] in mine(staff["team_lead"])


def test_notification_shows_my_approval_done(client, staff, auth_headers):
    p = _create(client, auth_headers(staff["writer"]), [staff["dept_head"].id, staff["team_lead"].id])
    h = auth_headers(staff["dept_head"])

    def my_request_notice():
        items = client.get("/api/notifications", headers=h).json()
        return next(n for n in items if n["title"].endswith("결재 요청") and f"open={p['id']}" in (n["link"] or ""))

    assert my_request_notice()["my_approval_done"] is False
    _approve(client, h, p["id"])
    assert my_request_notice()["my_approval_done"] is True


def test_delete_request_approved_deletes_proposal_and_steps(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = _create(client, writer_h, [staff["dept_head"].id], end_title="dept_head")
    _approve(client, auth_headers(staff["dept_head"]), p["id"])
    res = client.post(
        f"/api/proposals/{p['id']}/request-delete", headers=writer_h, json={"end_title": "dept_head", "approver_ids": [staff["dept_head"].id]}
    )
    assert res.status_code == 200, res.text
    assert res.json()["delete_requested"] is True and res.json()["status"] == "pending"

    assert _approve(client, auth_headers(staff["dept_head"]), p["id"]).status_code == 200
    assert db.query(Proposal).filter(Proposal.id == p["id"]).count() == 0
    assert _step_rows(db, p["id"]) == 0  # 결재 단계도 남지 않는다


def test_delete_request_rejected_restores_previous_approval(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = _create(client, writer_h, [staff["dept_head"].id, staff["team_lead"].id])
    _approve(client, auth_headers(staff["dept_head"]), p["id"])
    approved = _approve(client, auth_headers(staff["team_lead"]), p["id"]).json()

    client.post(f"/api/proposals/{p['id']}/request-delete", headers=writer_h, json={"end_title": "dept_head", "approver_ids": [staff["dept_head"].id]})
    res = client.put(f"/api/proposals/{p['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "보관 필요"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved" and body["delete_requested"] is False
    # 삭제 요청 전의 결재선(2단계, 둘 다 승인)으로 돌아간다
    assert [(s["step_order"], s["approver_id"], s["status"]) for s in body["steps"]] == [
        (s["step_order"], s["approver_id"], s["status"]) for s in approved["steps"]
    ]


def test_delete_pending_proposal_removes_steps(client, db, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = _create(client, writer_h, [staff["dept_head"].id, staff["team_lead"].id])
    assert _step_rows(db, p["id"]) == 2
    assert client.delete(f"/api/proposals/{p['id']}", headers=writer_h).status_code == 204
    assert _step_rows(db, p["id"]) == 0


def test_delete_rules(client, staff, auth_headers):
    writer_h = auth_headers(staff["writer"])
    p = _create(client, writer_h, [staff["dept_head"].id], end_title="dept_head")
    assert client.delete(f"/api/proposals/{p['id']}", headers=auth_headers(staff["other"])).status_code == 403  # 작성자만
    _approve(client, auth_headers(staff["dept_head"]), p["id"])
    assert client.delete(f"/api/proposals/{p['id']}", headers=writer_h).status_code == 400  # 승인된 품의서는 삭제 결재 필요
