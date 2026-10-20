"""엑셀 양식의 직인 이미지: 흰 배경은 투명하게 바꿔 아래 글씨를 가리지 않게 한다."""
from datetime import date
from io import BytesIO
from types import SimpleNamespace as NS

import openpyxl
import pytest
from PIL import Image, ImageDraw

from app.config import settings
from app.models.project_document import ProjectDocType
from app.services import project_document_template as t


def _png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _seal_on_white(size=(60, 60)) -> bytes:
    im = Image.new("RGB", size, (255, 255, 255))
    ImageDraw.Draw(im).ellipse((10, 10, size[0] - 10, size[1] - 10), outline=(200, 30, 30), width=5)
    return _png(im)


def test_white_background_becomes_transparent_and_ink_stays():
    out = Image.open(BytesIO(t._white_to_transparent(_seal_on_white()))).convert("RGBA")
    assert out.getpixel((0, 0))[3] == 0  # 모서리의 흰 바탕은 완전히 투명
    assert out.getpixel((30, 30))[3] == 0  # 원 안쪽의 흰 바탕도 투명 (아래 글씨가 보인다)
    r, g, b, a = out.getpixel((10, 30))  # 붉은 선 위
    assert a > 200 and r > 180 and g < 80 and b < 80  # 붉은색 그대로, 불투명


def test_antialiased_edges_keep_the_ink_color_instead_of_a_white_halo():
    # 붉은색과 흰색이 반반 섞인 가장자리 픽셀 → 반투명한 붉은색이어야 한다 (연한 분홍 불투명이 아니다)
    im = Image.new("RGB", (4, 4), (255, 255, 255))
    im.putpixel((1, 1), (228, 142, 142))  # 붉은 (200,30,30)이 흰색과 약 절반씩 섞인 색
    out = Image.open(BytesIO(t._white_to_transparent(_png(im)))).convert("RGBA")
    r, g, b, a = out.getpixel((1, 1))
    assert 60 < a < 200
    assert r > 180 and g < 90  # 원래의 붉은색에 가깝게 복원된다


def _ws_with_images(*images):
    ws = openpyxl.Workbook().active
    for data in images:
        from openpyxl.drawing.image import Image as XLImage

        ws.add_image(XLImage(BytesIO(data)))
    return ws


def test_only_squareish_opaque_images_are_changed():
    seal = _seal_on_white((60, 60))
    logo = _png(Image.new("RGB", (200, 48), (255, 255, 255)))  # 가로로 긴 로고는 그대로
    already = _png(Image.new("RGBA", (60, 60), (255, 255, 255, 0)))  # 이미 투명한 이미지도 그대로
    ws = _ws_with_images(seal, logo, already)
    t._make_seals_transparent(ws)

    def mode_alpha(img):
        img.ref.seek(0)
        im = Image.open(BytesIO(img.ref.read()))
        return im.mode, (im.convert("RGBA").getpixel((0, 0))[3])

    seal_img, logo_img, already_img = ws._images
    assert mode_alpha(seal_img) == ("RGBA", 0)
    assert mode_alpha(logo_img) == ("RGB", 255)
    assert mode_alpha(already_img)[0] == "RGBA"


@pytest.fixture()
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "project_documents_dir", str(tmp_path / "docs"))


def test_filled_purchase_order_has_a_transparent_seal(_tmp_storage):
    doc = NS(
        id=1, doc_type=ProjectDocType.purchase_order, issue_date=date(2026, 10, 20), client_name="한솔전자", manager_name="김철수",
        doc_no=None, currency="KRW", remark=None, items=[NS(content="PCB", quantity=1, unit_price=1000, note=None)],
    )
    ws = openpyxl.load_workbook(t.fill_project_document_template(doc)).active
    squares = []
    for img in ws._images:
        img.ref.seek(0)
        im = Image.open(BytesIO(img.ref.read()))
        if 0.75 <= im.width / im.height <= 1.33:
            squares.append(im)
    assert squares, "발주서 양식에는 직인 이미지가 있어야 한다"
    for im in squares:
        assert im.mode == "RGBA" and im.convert("RGBA").getchannel("A").getextrema()[0] == 0  # 투명한 부분이 있다
