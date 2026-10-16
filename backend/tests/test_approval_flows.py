"""증명서·프로젝트 문서(견적서 등)의 결재 흐름 특성화 테스트.

결재 승인/반려의 단계 진행 로직을 공통 모듈로 옮기기 전에 현재 동작을 고정한다.
PDF·엑셀 파일 생성은 이 테스트의 대상이 아니므로 파일을 만들지 않도록 대체한다(monkeypatch).
"""
import pytest

from app.models.approval_step import ApprovalStep, ApprovalStepStatus
from app.models.user import JobTitle, UserRole
from app.routers import documents as documents_router
from app.services import project_document_files as doc_files


@pytest.fixture(autouse=True)
def _no_file_generation(monkeypatch):
    monkeypatch.setattr(documents_router, "_issue_pdf", lambda record, user: None)
    monkeypatch.setattr(doc_files, "regenerate_documents", lambda db, doc: None)


@pytest.fixture()
def staff(make_user):
    return {
        "employee": make_user(name="일반직원"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "team_lead": make_user(title=JobTitle.team_lead, name="팀장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


def _steps(db, target_id):
    return (
        db.query(ApprovalStep).filter(ApprovalStep.target_id == target_id).order_by(ApprovalStep.step_order).all()
    )


# ── 증명서 ────────────────────────────────────────────────────────

def _request_certificate(client, headers, approver_ids, end_title="team_lead"):
    return client.post(
        "/api/documents/request",
        headers=headers,
        json={"doc_type": "employment", "purpose": "은행 제출", "end_title": end_title, "approver_ids": approver_ids},
    )


def test_certificate_two_step_approval(client, db, staff, auth_headers):
    res = _request_certificate(client, auth_headers(staff["employee"]), [staff["dept_head"].id, staff["team_lead"].id])
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "pending"

    # 현재 단계의 결재자가 아니면 처리할 수 없다
    assert client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"])).status_code == 403

    first = client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "pending"

    last = client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"]))
    assert last.status_code == 200, last.text
    assert last.json()["status"] == "approved"

    steps = _steps(db, doc["id"])
    assert [s.status for s in steps] == [ApprovalStepStatus.approved, ApprovalStepStatus.approved]
    assert all(s.decided_at is not None for s in steps)

    # 처리 끝난 문서는 다시 처리할 수 없다
    assert client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"])).status_code in (400, 403)


def test_certificate_reject_marks_step_and_blocks_rest(client, db, staff, auth_headers):
    doc = _request_certificate(client, auth_headers(staff["employee"]), [staff["dept_head"].id, staff["team_lead"].id]).json()
    rej = client.put(
        f"/api/documents/{doc['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "사유 부족"}
    )
    assert rej.status_code == 200, rej.text
    assert rej.json()["status"] == "rejected"
    steps = _steps(db, doc["id"])
    assert steps[0].status == ApprovalStepStatus.rejected
    assert steps[1].status == ApprovalStepStatus.pending
    assert client.put(f"/api/documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"])).status_code in (400, 403)


def test_certificate_final_decision_is_not_allowed(client, staff, auth_headers):
    res = client.post(
        "/api/documents/request",
        headers=auth_headers(staff["employee"]),
        json={"doc_type": "employment", "is_final_decision": True},
    )
    assert res.status_code == 400


def test_certificate_self_approval_chain_finishes_immediately(client, staff, auth_headers):
    # 대표가 신청하고 결재선이 대표 한 단계면 즉시 승인된다
    res = _request_certificate(client, auth_headers(staff["ceo"]), [staff["dept_head"].id], end_title="dept_head")
    assert res.json()["status"] == "pending"  # 부서장은 대표 본인이 아니므로 대기
    res2 = _request_certificate(client, auth_headers(staff["dept_head"]), [staff["dept_head"].id], end_title="dept_head")
    assert res2.status_code == 201, res2.text
    assert res2.json()["status"] == "approved"  # 신청자 = 유일한 결재자 → 자기결재로 즉시 승인


# ── 프로젝트 문서(견적서) ─────────────────────────────────────────

def _create_quotation(client, headers, approver_ids, end_title="team_lead"):
    return client.post(
        "/api/project-documents",
        headers=headers,
        json={
            "project_id": None,
            "project_other_name": "테스트 프로젝트",
            "doc_type": "quotation",
            "issue_date": "2026-10-16",
            "client_name": "테스트 거래처",
            "items": [{"content": "품목", "quantity": 2, "unit_price": 50000}],
            "end_title": end_title,
            "approver_ids": approver_ids,
        },
    )


def test_project_document_two_step_approval(client, db, make_user, staff, auth_headers):
    # 문서 작성 권한(projects 메뉴)이 있는 직원
    writer = make_user(menu_permissions=["projects"], name="작성자")
    res = _create_quotation(client, auth_headers(writer), [staff["dept_head"].id, staff["team_lead"].id])
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["status"] == "pending"

    # 지정되지 않은 사람은 승인할 수 없다
    assert client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"])).status_code == 403

    first = client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "pending"

    last = client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"]))
    assert last.status_code == 200, last.text
    assert last.json()["status"] == "approved"

    steps = _steps(db, doc["id"])
    assert [s.status for s in steps] == [ApprovalStepStatus.approved, ApprovalStepStatus.approved]


def test_project_document_reject(client, db, make_user, staff, auth_headers):
    writer = make_user(menu_permissions=["projects"], name="작성자")
    doc = _create_quotation(client, auth_headers(writer), [staff["dept_head"].id, staff["team_lead"].id]).json()
    rej = client.put(
        f"/api/project-documents/{doc['id']}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "단가 확인"}
    )
    assert rej.status_code == 200, rej.text
    assert rej.json()["status"] == "rejected"
    assert rej.json()["reject_reason"] == "단가 확인"
    steps = _steps(db, doc["id"])
    assert steps[0].status == ApprovalStepStatus.rejected
    assert client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["team_lead"])).status_code in (400, 403)


def test_project_document_approval_requires_pending(client, make_user, staff, auth_headers):
    writer = make_user(menu_permissions=["projects"], name="작성자")
    # 결재선 1단계(부서장)
    doc = _create_quotation(client, auth_headers(writer), [staff["dept_head"].id], end_title="dept_head").json()
    ok = client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert ok.json()["status"] == "approved"
    again = client.put(f"/api/project-documents/{doc['id']}/approve", headers=auth_headers(staff["dept_head"]))
    assert again.status_code in (400, 403)


# ── 결재 단계 처리 헬퍼(core/approval.py) ─────────────────────────────

def _chain(n):
    return [ApprovalStep(step_order=i + 1, approver_id=100 + i, status=ApprovalStepStatus.pending) for i in range(n)]


def test_approve_current_step_returns_next_step_until_last():
    from app.core.approval import approve_current_step

    steps = _chain(3)
    nxt = approve_current_step(steps, 1)
    assert nxt is steps[1]
    assert steps[0].status == ApprovalStepStatus.approved and steps[0].decided_at is not None
    assert steps[1].status == ApprovalStepStatus.pending

    assert approve_current_step(steps, 2) is steps[2]
    assert approve_current_step(steps, 3) is None  # 마지막 단계 승인 = 최종 승인
    assert all(s.status == ApprovalStepStatus.approved for s in steps)


def test_single_step_chain_is_final_on_first_approval():
    from app.core.approval import approve_current_step

    steps = _chain(1)
    assert approve_current_step(steps, 1) is None


def test_reject_current_step_leaves_later_steps_pending():
    from app.core.approval import reject_current_step

    steps = _chain(3)
    reject_current_step(steps, 2)
    assert [s.status for s in steps] == [
        ApprovalStepStatus.pending,
        ApprovalStepStatus.rejected,
        ApprovalStepStatus.pending,
    ]
    assert steps[1].decided_at is not None
