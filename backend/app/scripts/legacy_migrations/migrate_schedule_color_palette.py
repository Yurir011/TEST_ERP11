"""일정관리 색상 팔레트를 기존 8색(선명+뮤트 혼합)에서 새 12색(소프트 파스텔 6색 + 그레이 틴트 6색)으로
교체하면서, 기존에 저장된 일정의 color 값을 새 팔레트로 옮겨주는 1회성 데이터 마이그레이션 스크립트.
schedule_events.color는 자유 입력 String 컬럼이라 스키마 변경은 필요 없고, 기존 값만 치환하면 된다.

사용법: backend 폴더에서
  venv\\Scripts\\python.exe -m app.scripts.migrate_schedule_color_palette

동작:
  - schedule_events.color의 예전 값을 새 팔레트 값으로 1:1 치환한다.
"""
from sqlalchemy import text

from app.database import engine
from app.logging_config import get_logger, setup_logging

setup_logging()
logger = get_logger("MigrateScheduleColorPalette")

# 예전 색상 -> 새 팔레트 색상 매핑 (색감이 가장 가까운 것끼리 짝지었다)
COLOR_MAP = {
    "blue": "skyblue",
    "green": "sagemint",
    "red": "rose",
    "orange": "peach",
    "purple": "lilac",
    "pink": "graypink",
    "teal": "grayteal",
    "gray": "grayblue",
}


def main():
    with engine.begin() as conn:
        for old_color, new_color in COLOR_MAP.items():
            result = conn.execute(
                text("UPDATE schedule_events SET color = :new_color WHERE color = :old_color"),
                {"new_color": new_color, "old_color": old_color},
            )
            if result.rowcount:
                logger.debug(f"[MigrateScheduleColorPalette] {old_color} -> {new_color}: {result.rowcount}건")

    print("마이그레이션 완료: 일정관리 색상 팔레트 치환 반영")


if __name__ == "__main__":
    main()
