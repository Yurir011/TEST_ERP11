"""
회사 직인 이미지(흰 배경)를 투명 배경 PNG로 변환해 app/assets/stamp.png 로 저장한다.
재직/경력증명서 PDF의 '대표자 (인)' 자리에 겹쳐 찍히는 이미지로 사용된다 (certificate_pdf.py 참고).

사용법: backend 폴더에서 (원본 Stamp.png는 프로젝트 루트에 위치)
  venv\\Scripts\\python.exe -m app.scripts.process_stamp
"""
import colorsys
import os

from PIL import Image

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "Stamp.png")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "stamp.png")

# 잉크 농도(ink_amount)가 낮은 옅은 획도 더 진하고 채도 높은 빨강으로 보이도록 하는 계수.
ALPHA_GAMMA = 0.6  # 1보다 작을수록 옅은 부분도 더 불투명해짐
SATURATION_BOOST = 1.6
VALUE_DARKEN_STRENGTH = 0.45  # 잉크가 있는 픽셀의 명도를 얼마나 낮출지


def main():
    img = Image.open(SOURCE_PATH).convert("RGBA")
    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, _a = pixels[x, y]
            # 흰 배경에 가까울수록 투명하게, 잉크(붉은 획)가 진할수록 불투명하게 처리한다.
            luminance = 0.299 * r + 0.587 * g + 0.114 * b
            ink_amount = max(0.0, min(1.0, (255 - luminance) / 255))
            alpha = max(0, min(255, round((ink_amount**ALPHA_GAMMA) * 255)))

            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            s = min(1.0, s * SATURATION_BOOST)
            v = v * (1 - VALUE_DARKEN_STRENGTH * ink_amount)
            nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)

            pixels[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), alpha)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    img.save(OUTPUT_PATH)
    print(f"직인 이미지 변환 완료: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
