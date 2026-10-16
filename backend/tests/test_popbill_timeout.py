"""팝빌 연동 통신 안전장치 (O7): SDK 연결 타임아웃, 응답 없음 → 504 안내. 실제 팝빌 서버에는 접속하지 않는다."""
import http.client
import socket
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

import linkhub.linkhub
import popbill.base
import pytest

from app.config import settings
from app.models.project_document import ProjectDocType, ProjectDocument, ProjectDocumentStatus
from app.models.user import JobTitle, UserRole
from app.services import popbill_service
from app.services.money import vat_amount


def test_sdk_connections_get_timeout_without_touching_global_http_client():
    for module in (popbill.base, linkhub.linkhub):
        assert module.httpclient.HTTPSConnection("example.invalid").timeout == settings.popbill_timeout_seconds
        assert module.httpclient.HTTPConnection("example.invalid").timeout == settings.popbill_timeout_seconds
        # 호출하는 쪽이 직접 준 값은 그대로
        assert module.httpclient.HTTPSConnection("example.invalid", timeout=3).timeout == 3
    assert http.client.HTTPSConnection("example.invalid").timeout is socket._GLOBAL_DEFAULT_TIMEOUT  # 전역은 그대로


def test_vat_matches_previous_popbill_rounding():
    """팝빌 전용 _round_tax(공급가/10 사사오입)를 공통 vat_amount 로 바꿨다 — 정수 공급가에서 결과가 같다."""
    old = lambda s: int((Decimal(s) / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP))  # noqa: E731
    assert all(old(s) == vat_amount(s) for s in range(0, 200_000))
    assert all(old(s) == vat_amount(s) for s in (-15, -5, 1_000_005, 99_999_995))


@pytest.fixture()
def issued_doc(db, make_user):
    writer = make_user(menu_permissions=["projects", "tax_invoice"])
    doc = ProjectDocument(
        doc_type=ProjectDocType.tax_invoice, issue_date=date(2026, 10, 1), client_name="팝빌상사",
        status=ProjectDocumentStatus.approved, created_by=writer.id, popbill_mgt_key="BENCH0000000001",
    )
    db.add(doc)
    db.flush()
    return doc


@pytest.mark.parametrize("path,fn", [("view-url", "get_view_url"), ("pdf-url", "get_pdf_url")])
def test_popbill_timeout_returns_504_with_guidance(client, auth_headers, make_user, issued_doc, monkeypatch, path, fn):
    def _timeout(doc):
        raise TimeoutError("timed out")

    monkeypatch.setattr(popbill_service, fn, _timeout)
    ceo = make_user(role=UserRole.admin, title=JobTitle.ceo)
    res = client.get(f"/api/project-documents/{issued_doc.id}/popbill/{path}", headers=auth_headers(ceo))
    assert res.status_code == 504
    assert "팝빌 서버와 통신하지 못했습니다" in res.json()["detail"]
