"""리비전 0005(품의서 결재 단계 → 공용 테이블 이전)의 데이터 이전 검증."""
import importlib.util
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import text

from app.models.proposal import Proposal, ProposalApprovalStep, ProposalStatus, ProposalStepStatus
from app.models.user import JobTitle
from tests.conftest import BACKEND_DIR

_spec = importlib.util.spec_from_file_location("rev0005", BACKEND_DIR / "alembic" / "versions" / "0005_move_proposal_steps.py")
rev0005 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rev0005)


def _proposal(db, creator, steps):
    p = Proposal(
        doc_no=f"T-{datetime.now().timestamp()}", title="이전 테스트", topic="t", content="c", issue_date=date(2026, 10, 1),
        department_code="X", department_name="X", created_by=creator.id, status=ProposalStatus.pending,
    )
    db.add(p)
    db.flush()
    for order, (title, approver, st) in enumerate(steps, start=1):
        db.add(
            ProposalApprovalStep(
                proposal_id=p.id, step_order=order, title=title, approver_id=approver.id, status=st,
                decided_at=datetime(2026, 10, 2, tzinfo=timezone.utc) if st != ProposalStepStatus.pending else None,
            )
        )
    db.flush()
    return p


def _new_rows(db, pid):
    return db.execute(
        text("SELECT step_order, title::text, approver_id, status::text, decided_at FROM approval_steps "
             "WHERE target_type = 'proposal' AND target_id = :i ORDER BY step_order"),
        {"i": pid},
    ).all()


def test_copy_moves_rows_with_same_values_and_is_idempotent(db, make_user):
    writer, head, lead = make_user(), make_user(title=JobTitle.dept_head), make_user(title=JobTitle.team_lead)
    p = _proposal(db, writer, [(JobTitle.dept_head, head, ProposalStepStatus.approved), (JobTitle.team_lead, lead, ProposalStepStatus.pending)])

    copied = rev0005.copy_proposal_steps(db.connection())
    assert copied == 2
    rows = _new_rows(db, p.id)
    assert [(r[0], r[1], r[2], r[3]) for r in rows] == [(1, "dept_head", head.id, "approved"), (2, "team_lead", lead.id, "pending")]
    assert rows[0][4] is not None and rows[1][4] is None  # 결정 시각도 그대로

    assert rev0005.copy_proposal_steps(db.connection()) == 0  # 다시 실행해도 중복되지 않는다
    assert len(_new_rows(db, p.id)) == 2


def test_verification_fails_when_rows_differ(db, make_user):
    writer, head = make_user(), make_user(title=JobTitle.dept_head)
    p = _proposal(db, writer, [(JobTitle.dept_head, head, ProposalStepStatus.approved)])
    rev0005.copy_proposal_steps(db.connection())
    # 공용 테이블 쪽 값을 일부러 어긋나게 만든 뒤 검증하면 실패해야 한다
    db.execute(text("UPDATE approval_steps SET status = 'rejected' WHERE target_type = 'proposal' AND target_id = :i"), {"i": p.id})
    with pytest.raises(RuntimeError):
        rev0005.copy_proposal_steps(db.connection())
