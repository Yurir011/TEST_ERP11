"""
공통 로깅 설정.
CLAUDE.md 규칙: 모든 실행 프로그램은 [모듈명] 형식의 디버그 메시지를 남긴다.
운영 환경에서는 LOG_LEVEL 환경변수로 레벨을 조정한다 (기본값 DEBUG).
"""
import logging
import os
import sys


def setup_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "DEBUG").upper()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )


def get_logger(module_name: str) -> logging.Logger:
    """모듈별 로거를 반환한다. 사용 예: logger.debug(f"[Attendance] 출근 기록 저장: user_id={user_id}")"""
    return logging.getLogger(module_name)
