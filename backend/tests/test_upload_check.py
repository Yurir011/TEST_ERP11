"""업로드 파일 내용 검사(services/upload_check.py) 테스트."""
import pytest
from fastapi import HTTPException

from app.config import settings
from app.models.user import JobTitle, UserRole
from app.services.upload_check import ATTACHMENT_TYPES, IMAGE_OR_PDF_TYPES, IMAGE_TYPES, check_content, sniff_kind

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 16
PDF = b"%PDF-1.7\n" + b"0" * 32
DOCX = b"PK\x03\x04" + b"\x00" * 32
XLS = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 32
HTML = b"<html><script>alert(1)</script></html>"
EXE = b"MZ\x90\x00" + b"\x00" * 32


@pytest.mark.parametrize(
    "content, kind",
    [(PNG, "png"), (JPEG, "jpeg"), (WEBP, "webp"), (PDF, "pdf"), (DOCX, "zip"), (XLS, "ole"), (b"GIF89a....", "gif"), (HTML, None), (EXE, None)],
)
def test_sniff_kind(content, kind):
    assert sniff_kind(content) == kind


def test_matching_content_passes():
    check_content(PNG, "image/png", IMAGE_TYPES)
    check_content(JPEG, "image/jpeg", IMAGE_TYPES)
    check_content(PDF, "application/pdf", IMAGE_OR_PDF_TYPES)
    check_content(DOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ATTACHMENT_TYPES)
    check_content(XLS, "application/vnd.ms-excel", ATTACHMENT_TYPES)
    check_content("메모 내용입니다".encode("utf-8"), "text/plain", ATTACHMENT_TYPES)
    check_content("메모".encode("cp949"), "text/plain", ATTACHMENT_TYPES)


@pytest.mark.parametrize(
    "content, content_type, allowed",
    [
        (HTML, "image/png", IMAGE_TYPES),  # 헤더만 이미지로 속인 HTML
        (EXE, "image/jpeg", IMAGE_TYPES),  # 실행 파일
        (PNG, "image/jpeg", IMAGE_TYPES),  # 형식은 이미지지만 선언과 다름
        (PNG, "application/pdf", IMAGE_OR_PDF_TYPES),
        (EXE, "text/plain", ATTACHMENT_TYPES),  # 텍스트로 속인 바이너리(NUL 포함)
        (PNG, "image/gif", IMAGE_TYPES),  # 허용 목록에 없는 형식
    ],
)
def test_mismatched_content_is_rejected(content, content_type, allowed):
    with pytest.raises(HTTPException) as exc:
        check_content(content, content_type, allowed)
    assert exc.value.status_code == 400


def test_empty_and_oversized_files_are_rejected():
    with pytest.raises(HTTPException):
        check_content(b"", "image/png", IMAGE_TYPES)
    with pytest.raises(HTTPException) as exc:
        check_content(PNG + b"\x00" * 100, "image/png", IMAGE_TYPES, max_bytes=50)
    assert "MB" in exc.value.detail


# ── API: 영수증 업로드 ─────────────────────────────────────────────

@pytest.fixture()
def receipt_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "receipts_dir", str(tmp_path))  # 실제 storage 폴더에 쓰지 않는다
    return tmp_path


def _payment(client, headers):
    res = client.post(
        "/api/payments",
        headers=headers,
        json={"type": "withdrawal", "payment_date": "2026-10-16", "category": "소모품비", "description": "테스트", "amount": 1000, "method": "cash"},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_receipt_upload_rejects_fake_image(client, make_user, auth_headers, receipt_dir):
    h = auth_headers(make_user(role=UserRole.admin, title=JobTitle.ceo))
    pay = _payment(client, h)
    res = client.post(f"/api/payments/{pay['id']}/receipt", headers=h, files={"file": ("receipt.png", HTML, "image/png")})
    assert res.status_code == 400
    assert "형식이 아닙니다" in res.json()["detail"]
    assert list(receipt_dir.iterdir()) == []  # 저장되지 않았다


def test_receipt_upload_accepts_real_image(client, make_user, auth_headers, receipt_dir):
    h = auth_headers(make_user(role=UserRole.admin, title=JobTitle.ceo))
    pay = _payment(client, h)
    res = client.post(f"/api/payments/{pay['id']}/receipt", headers=h, files={"file": ("receipt.png", PNG, "image/png")})
    assert res.status_code == 200, res.text
    assert res.json()["has_receipt"] is True
    assert len(list(receipt_dir.iterdir())) == 1


def test_receipt_upload_keeps_existing_type_message(client, make_user, auth_headers, receipt_dir):
    h = auth_headers(make_user(role=UserRole.admin, title=JobTitle.ceo))
    pay = _payment(client, h)
    res = client.post(f"/api/payments/{pay['id']}/receipt", headers=h, files={"file": ("a.pdf", PDF, "application/pdf")})
    assert res.status_code == 400
    assert res.json()["detail"] == "이미지 파일(jpg, png, webp)만 업로드할 수 있습니다."  # 기존 문구 유지
