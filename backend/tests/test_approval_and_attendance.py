"""결재선 검증(core/approval.py), 연차 결재 흐름, 출퇴근 기록 특성화 테스트."""
import pytest
from fastapi import HTTPException

from app.core.approval import advance_chain_self_approvals, build_chain_titles, validate_chain_approvers
from app.models.approval_step import ApprovalStep, ApprovalStepStatus
from app.models.user import JobTitle, UserRole


@pytest.fixture()
def staff(make_user):
    """부서장·팀장·대표가 모두 있는 조직."""
    return {
        "employee": make_user(name="일반직원"),
        "dept_head": make_user(title=JobTitle.dept_head, name="부서장"),
        "team_lead": make_user(title=JobTitle.team_lead, name="팀장"),
        "ceo": make_user(role=UserRole.admin, title=JobTitle.ceo, name="대표"),
    }


# ── 결재선 구성/검증 ───────────────────────────────────────────────

def test_chain_is_prefix_of_dept_head_team_lead_ceo(db, staff):
    assert build_chain_titles(db, JobTitle.dept_head) == [JobTitle.dept_head]
    assert build_chain_titles(db, JobTitle.team_lead) == [JobTitle.dept_head, JobTitle.team_lead]
    assert build_chain_titles(db, JobTitle.ceo) == [JobTitle.dept_head, JobTitle.team_lead, JobTitle.ceo]


def test_chain_skips_titles_without_active_staff(db, make_user):
    # 이 테스트 DB 트랜잭션 안에는 대표만 있다 → 부서장/팀장 단계는 건너뛴다
    make_user(role=UserRole.admin, title=JobTitle.ceo)
    chain = build_chain_titles(db, JobTitle.ceo)
    assert chain[-1] == JobTitle.ceo


def test_validate_chain_requires_end_title(db, staff):
    with pytest.raises(HTTPException) as exc:
        validate_chain_approvers(db, None, [])
    assert exc.value.status_code == 400


def test_validate_chain_requires_one_approver_per_step(db, staff):
    with pytest.raises(HTTPException) as exc:
        validate_chain_approvers(db, JobTitle.team_lead, [staff["dept_head"].id])
    assert exc.value.status_code == 400


def test_validate_chain_rejects_wrong_title_for_step(db, staff):
    with pytest.raises(HTTPException) as exc:
        # 첫 단계(부서장)에 팀장을 지정
        validate_chain_approvers(db, JobTitle.team_lead, [staff["team_lead"].id, staff["team_lead"].id])
    assert exc.value.status_code == 400


def test_validate_chain_ok(db, staff):
    chain, approvers = validate_chain_approvers(db, JobTitle.team_lead, [staff["dept_head"].id, staff["team_lead"].id])
    assert chain == [JobTitle.dept_head, JobTitle.team_lead]
    assert [a.id for a in approvers] == [staff["dept_head"].id, staff["team_lead"].id]


def test_self_approval_advances_only_through_own_consecutive_steps(staff):
    ceo = staff["ceo"]
    step_a = ApprovalStep(step_order=1, approver_id=ceo.id, status=ApprovalStepStatus.pending)
    step_b = ApprovalStep(step_order=2, approver_id=staff["team_lead"].id, status=ApprovalStepStatus.pending)
    assert advance_chain_self_approvals([step_a, step_b], ceo) is False  # 두 번째 단계에서 멈춤
    assert step_a.status == ApprovalStepStatus.approved
    assert step_b.status == ApprovalStepStatus.pending

    only_mine = ApprovalStep(step_order=1, approver_id=ceo.id, status=ApprovalStepStatus.pending)
    assert advance_chain_self_approvals([only_mine], ceo) is True


# ── 연차 신청 → 승인/반려 흐름 ──────────────────────────────────────

def _request_leave(client, headers, *, approver_ids, end_title="team_lead"):
    return client.post(
        "/api/leaves",
        headers=headers,
        json={
            "start_date": "2026-12-14",
            "end_date": "2026-12-15",
            "reason": "테스트 연차",
            "end_title": end_title,
            "approver_ids": approver_ids,
        },
    )


def test_leave_two_step_approval_flow(client, staff, auth_headers):
    res = _request_leave(client, auth_headers(staff["employee"]), approver_ids=[staff["dept_head"].id, staff["team_lead"].id])
    assert res.status_code in (200, 201), res.text
    leave = res.json()
    assert leave["status"] == "pending"
    leave_id = leave["id"]

    # 지정되지 않은 사람은 처리할 수 없다
    assert client.put(f"/api/leaves/{leave_id}/approve", headers=auth_headers(staff["team_lead"])).status_code == 403

    # 1단계(부서장) 승인 → 아직 대기, 다음은 팀장
    step1 = client.put(f"/api/leaves/{leave_id}/approve", headers=auth_headers(staff["dept_head"]))
    assert step1.status_code == 200, step1.text
    assert step1.json()["status"] == "pending"

    # 2단계(팀장) 승인 → 최종 승인
    step2 = client.put(f"/api/leaves/{leave_id}/approve", headers=auth_headers(staff["team_lead"]))
    assert step2.status_code == 200, step2.text
    assert step2.json()["status"] == "approved"

    # 이미 처리된 신청은 다시 처리할 수 없다
    again = client.put(f"/api/leaves/{leave_id}/approve", headers=auth_headers(staff["team_lead"]))
    assert again.status_code in (400, 403)


def test_leave_reject_stops_flow(client, staff, auth_headers):
    res = _request_leave(client, auth_headers(staff["employee"]), approver_ids=[staff["dept_head"].id, staff["team_lead"].id])
    leave_id = res.json()["id"]
    rej = client.put(
        f"/api/leaves/{leave_id}/reject", headers=auth_headers(staff["dept_head"]), json={"reason": "일정 겹침"}
    )
    assert rej.status_code == 200, rej.text
    assert rej.json()["status"] == "rejected"
    # 반려 후에는 다음 결재자가 승인할 수 없다
    assert client.put(f"/api/leaves/{leave_id}/approve", headers=auth_headers(staff["team_lead"])).status_code in (400, 403)


# ── 출퇴근 ────────────────────────────────────────────────────────

def test_clock_out_without_clock_in_is_400(client, make_user, auth_headers):
    user = make_user()
    assert client.post("/api/attendance/clock-out", headers=auth_headers(user)).status_code == 400


def test_clock_in_out_flow_and_duplicates(client, make_user, auth_headers):
    user = make_user()
    h = auth_headers(user)
    first = client.post("/api/attendance/clock-in", headers=h)
    assert first.status_code == 200, first.text
    assert first.json()["clock_in"] is not None
    assert first.json()["clock_out"] is None

    assert client.post("/api/attendance/clock-in", headers=h).status_code == 400  # 중복 출근

    out = client.post("/api/attendance/clock-out", headers=h)
    assert out.status_code == 200, out.text
    assert out.json()["clock_out"] is not None

    assert client.post("/api/attendance/clock-out", headers=h).status_code == 400  # 중복 퇴근


def test_attendance_requires_login(client):
    assert client.post("/api/attendance/clock-in").status_code == 401
