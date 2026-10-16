"""연차 계산(core/leave_calc.py) 특성화 테스트 — 현재 동작을 그대로 고정한다."""
from datetime import date

import pytest

from app.core.leave_calc import (
    calculate_annual_leave_days,
    count_business_days,
    full_months_between,
    get_leave_year_window,
)


@pytest.mark.parametrize(
    "hire, as_of, expected",
    [
        (date(2025, 1, 1), date(2025, 1, 31), 0),  # 1개월 미만
        (date(2025, 1, 1), date(2025, 4, 15), 3),  # 만근 개월 수만큼
        (date(2025, 1, 1), date(2025, 12, 31), 11),  # 1년 미만은 최대 11일
        (date(2024, 1, 1), date(2025, 1, 1), 15),  # 만 1년 → 15일
        (date(2022, 1, 1), date(2025, 1, 1), 16),  # 3년 → 15 + (3-1)//2
        (date(2020, 1, 1), date(2025, 1, 1), 17),  # 5년 → 17
        (date(2000, 1, 1), date(2025, 1, 1), 25),  # 상한 25일
        (date(2025, 6, 1), date(2025, 1, 1), 0),  # 기준일이 입사일보다 이전
    ],
)
def test_calculate_annual_leave_days(hire, as_of, expected):
    assert calculate_annual_leave_days(hire, as_of) == expected


def test_full_months_between_day_boundary():
    # 일(day)이 모자라면 한 달을 채우지 않은 것으로 본다
    assert full_months_between(date(2025, 1, 31), date(2025, 2, 28)) == 0
    assert full_months_between(date(2025, 1, 15), date(2025, 3, 15)) == 2
    assert full_months_between(date(2025, 3, 15), date(2025, 1, 15)) == 0  # 음수는 0


def test_leave_year_window():
    start, end = get_leave_year_window(date(2024, 3, 15), date(2025, 6, 1))
    assert (start, end) == (date(2025, 3, 15), date(2026, 3, 15))


def test_leave_year_window_leap_day_hire():
    # 2/29 입사자는 윤년이 아닌 해의 기념일을 2/28로 보정한다
    start, end = get_leave_year_window(date(2020, 2, 29), date(2021, 6, 1))
    assert (start, end) == (date(2021, 2, 28), date(2022, 2, 28))


def test_leave_year_window_before_hire():
    assert get_leave_year_window(date(2025, 6, 1), date(2025, 1, 1)) == (date(2025, 6, 1), date(2025, 6, 1))


def test_count_business_days():
    assert count_business_days(date(2026, 10, 12), date(2026, 10, 18)) == 5  # 월~일 → 평일 5일
    assert count_business_days(date(2026, 10, 17), date(2026, 10, 18)) == 0  # 토·일
    assert count_business_days(date(2026, 10, 12), date(2026, 10, 12)) == 1  # 하루
    assert count_business_days(date(2026, 10, 13), date(2026, 10, 12)) == 0  # 종료가 시작보다 이전
