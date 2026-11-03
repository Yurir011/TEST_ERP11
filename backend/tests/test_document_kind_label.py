"""세금계산서 등록 화면에서 세금계산서가 아닌 서류(영수증·계약서 등)를 직접 이름 붙여 기록하는 경우."""
import pytest

from app.models.user import JobTitle

from app.services import project_document_files as doc_files

ITEM = {"content": "품목", "quantity": 1, "unit_price": 1_000}


@pytest.fixture(autouse=True)
def _no_file_generation(monkeypatch):
    monkeypatch.setattr(doc_files, "regenerate_documents", lambda db, doc: None)


@pytest.fixture()
def ctx(make_user, auth_headers):
    writer = make_user(menu_permissions=["projects", "tax_invoice"], name="작성자")
    head = make_user(title=JobTitle.dept_head, name="부서장")
    return auth_headers(writer), head.id, auth_headers(head)


def _payload(head_id, **extra):
    return {
        "project_id": None,
        "project_other_name": "테스트 프로젝트",
        "doc_type": "tax_invoice",
        "issue_date": "2026-11-03",
        "purpose_type": "영수",
        "client_name": "테스트 거래처",
        "items": [ITEM],
        "end_title": "dept_head",
        "approver_ids": [head_id],
        **extra,
    }


def test_kind_label_is_saved_trimmed_and_returned(client, ctx):
    h, hid, _head_h = ctx
    r = client.post("/api/project-documents", headers=h, json=_payload(hid, kind_label="  건축허가서  "))
    assert r.status_code == 201, r.text
    assert r.json()["kind_label"] == "건축허가서"
    listed = client.get("/api/project-documents?doc_type=tax_invoice", headers=h).json()
    assert listed[0]["kind_label"] == "건축허가서"


def test_blank_or_missing_kind_label_is_none(client, ctx):
    h, hid, _head_h = ctx
    assert client.post("/api/project-documents", headers=h, json=_payload(hid)).json()["kind_label"] is None
    assert client.post("/api/project-documents", headers=h, json=_payload(hid, kind_label="   ")).json()["kind_label"] is None


def test_kind_label_longer_than_30_is_rejected(client, ctx):
    h, hid, _head_h = ctx
    assert client.post("/api/project-documents", headers=h, json=_payload(hid, kind_label="가" * 31)).status_code == 422


def test_kind_label_is_ignored_for_other_document_types(client, ctx):
    h, hid, _head_h = ctx
    r = client.post("/api/project-documents", headers=h, json=_payload(hid, doc_type="quotation", purpose_type="청구", kind_label="영수증"))
    assert r.status_code == 201, r.text
    assert r.json()["kind_label"] is None


def test_update_can_change_and_clear_the_label(client, ctx):
    h, hid, head_h = ctx
    doc = client.post("/api/project-documents", headers=h, json=_payload(hid, kind_label="영수증")).json()
    assert client.put(f"/api/project-documents/{doc['id']}/approve", headers=head_h).status_code == 200  # 승인된 문서는 다시 결재를 올리며 수정
    body = {k: doc[k] for k in ("issue_date", "currency", "purpose_type", "client_name", "manager_name")}
    body.update(items=[ITEM], update_project=False, request_approval=True, end_title="dept_head", approver_ids=[hid])

    def put(**extra):
        r = client.put(f"/api/project-documents/{doc['id']}", headers=h, json={**body, **extra})
        assert r.status_code == 200, r.text
        return r.json()

    assert put(kind_label="계약서")["kind_label"] == "계약서"
    assert client.put(f"/api/project-documents/{doc['id']}/approve", headers=head_h).status_code == 200
    assert put()["kind_label"] == "계약서"  # 값을 안 보내면 그대로
    assert client.put(f"/api/project-documents/{doc['id']}/approve", headers=head_h).status_code == 200
    assert put(kind_label="")["kind_label"] is None
