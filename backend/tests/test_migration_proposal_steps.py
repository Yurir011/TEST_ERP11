"""리비전 0005(품의서 결재 단계 → 공용 테이블 이전)와 0006(옛 테이블 삭제)의 데이터 검증.

테스트 DB 는 최신(0006 적용, 옛 테이블 없음)이므로, 각 테스트에서 0006 의 되돌리기 함수로 옛 테이블을 다시 만든다.
테스트마다 롤백되어 DB 에 남지 않는다.
"""
import importlib.util
from datetime import date, datetime

import pytest
from sqlalchemy import text

from app.models.proposal import Proposal, ProposalStatus
from app.models.user import JobTitle
from tests.conftest import BACKEND_DIR


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, BACKEND_DIR / "alembic" / "versions" / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rev0005 = _load("rev0005", "0005_move_proposal_steps.py")
rev0006 = _load("rev0006", "0006_drop_old_proposal_steps.py")


def _proposal(db, creator):
    p = Proposal(
        doc_no=f"T-{datetime.now().timestamp()}", title="이전 테스트", topic="t", content="c", issue_date=date(2026, 10, 1),
        department_code="X", department_name="X", created_by=creator.id, status=ProposalStatus.pending,
    )
    db.add(p)
    db.flush()
    return p


def _old_table_with(db, pid, steps):
    """옛 테이블을 다시 만들고 (직책, 결재자, 상태) 단계들을 넣는다."""
    rev0006.restore_old_table(db.connection())
    for order, (title, approver, st) in enumerate(steps, start=1):
        db.execute(
            text(
                "INSERT INTO proposal_approval_steps (proposal_id, step_order, title, approver_id, status, decided_at) "
                "VALUES (:p, :o, CAST(:t AS jobtitle), :a, CAST(:s AS proposalstepstatus), "
                "CASE WHEN :s = 'pending' THEN NULL ELSE TIMESTAMPTZ '2026-10-02 00:00+00' END)"
            ),
            {"p": pid, "o": order, "t": title.value, "a": approver.id, "s": st},
        )


def _new_rows(db, pid):
    return db.execute(
        text("SELECT step_order, title::text, approver_id, status::text, decided_at FROM approval_steps "
             "WHERE target_type = 'proposal' AND target_id = :i ORDER BY step_order"),
        {"i": pid},
    ).all()


def _old_table_exists(db):
    return db.execute(text("SELECT to_regclass('proposal_approval_steps')")).scalar() is not None


def test_copy_moves_rows_with_same_values_and_is_idempotent(db, make_user):
    writer, head, lead = make_user(), make_user(title=JobTitle.dept_head), make_user(title=JobTitle.team_lead)
    p = _proposal(db, writer)
    _old_table_with(db, p.id, [(JobTitle.dept_head, head, "approved"), (JobTitle.team_lead, lead, "pending")])

    copied = rev0005.copy_proposal_steps(db.connection())
    assert copied == 2
    rows = _new_rows(db, p.id)
    assert [(r[0], r[1], r[2], r[3]) for r in rows] == [(1, "dept_head", head.id, "approved"), (2, "team_lead", lead.id, "pending")]
    assert rows[0][4] is not None and rows[1][4] is None  # 결정 시각도 그대로

    assert rev0005.copy_proposal_steps(db.connection()) == 0  # 다시 실행해도 중복되지 않는다
    assert len(_new_rows(db, p.id)) == 2


def test_copy_verification_fails_when_rows_differ(db, make_user):
    writer, head = make_user(), make_user(title=JobTitle.dept_head)
    p = _proposal(db, writer)
    _old_table_with(db, p.id, [(JobTitle.dept_head, head, "approved")])
    rev0005.copy_proposal_steps(db.connection())
    # 공용 테이블 쪽 값을 일부러 어긋나게 만든 뒤 검증하면 실패해야 한다
    db.execute(text("UPDATE approval_steps SET status = 'rejected' WHERE target_type = 'proposal' AND target_id = :i"), {"i": p.id})
    with pytest.raises(RuntimeError):
        rev0005.copy_proposal_steps(db.connection())


def test_drop_refuses_when_old_rows_are_missing_from_shared_table(db, make_user):
    writer, head = make_user(), make_user(title=JobTitle.dept_head)
    p = _proposal(db, writer)
    _old_table_with(db, p.id, [(JobTitle.dept_head, head, "approved")])  # 공용 테이블로 옮기지 않은 행
    with pytest.raises(RuntimeError):
        rev0006.drop_old_table(db.connection())
    assert _old_table_exists(db)  # 지우지 않았다


def test_drop_after_copy_and_restore_roundtrip(db, make_user):
    writer, head, lead = make_user(), make_user(title=JobTitle.dept_head), make_user(title=JobTitle.team_lead)
    p = _proposal(db, writer)
    _old_table_with(db, p.id, [(JobTitle.dept_head, head, "approved"), (JobTitle.team_lead, lead, "rejected")])
    rev0005.copy_proposal_steps(db.connection())

    rev0006.drop_old_table(db.connection())
    assert not _old_table_exists(db)
    assert db.execute(text("SELECT to_regtype('proposalstepstatus')")).scalar() is None  # 상태 enum 도 지운다

    # 되돌리기: 옛 테이블을 다시 만들고 공용 테이블에서 같은 값으로 복원
    restored = rev0006.restore_old_table(db.connection())
    assert restored >= 2
    old = db.execute(
        text("SELECT step_order, title::text, approver_id, status::text FROM proposal_approval_steps WHERE proposal_id = :i ORDER BY step_order"),
        {"i": p.id},
    ).all()
    assert [tuple(r) for r in old] == [(1, "dept_head", head.id, "approved"), (2, "team_lead", lead.id, "rejected")]
