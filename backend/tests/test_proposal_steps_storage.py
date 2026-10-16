"""품의서 결재 단계가 공용 테이블(approval_steps)에만 저장되는지 (09 문서 통합 이후)."""
from sqlalchemy import text

from app.models.user import JobTitle
from app.routers import proposals as proposals_router


def test_new_proposal_steps_are_stored_in_shared_table_only(client, db, make_user, auth_headers, monkeypatch):
    monkeypatch.setattr(proposals_router, "_regenerate_pdf", lambda p: None)
    writer, head = make_user(), make_user(title=JobTitle.dept_head)
    res = client.post(
        "/api/proposals",
        headers=auth_headers(writer),
        json={"title": "t", "topic": "t", "content": "c", "end_title": "dept_head", "approver_ids": [head.id]},
    )
    assert res.status_code == 201, res.text
    pid = res.json()["id"]
    old = db.execute(text("SELECT count(*) FROM proposal_approval_steps WHERE proposal_id = :i"), {"i": pid}).scalar()
    new = db.execute(text("SELECT count(*) FROM approval_steps WHERE target_type = 'proposal' AND target_id = :i"), {"i": pid}).scalar()
    assert (old, new) == (0, 1)
