from datetime import date, timedelta


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # 2/29 입사자의 윤년이 아닌 기념일 보정
        return d.replace(year=d.year + years, day=28)


def full_months_between(start: date, end: date) -> int:
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return max(months, 0)


def full_years_between(start: date, end: date) -> int:
    return full_months_between(start, end) // 12


def calculate_annual_leave_days(hire_date: date, as_of: date) -> int:
    """근로기준법 기준 연차유급휴가 일수의 간이 계산.
    - 근속 1년 미만: 만근 개월 수만큼 발생 (최대 11일)
    - 근속 1년 이상: 15일 + (근속연수-1)//2, 최대 25일
    """
    if as_of < hire_date:
        return 0
    years = full_years_between(hire_date, as_of)
    if years < 1:
        return min(full_months_between(hire_date, as_of), 11)
    return min(15 + (years - 1) // 2, 25)


def get_leave_year_window(hire_date: date, as_of: date) -> tuple[date, date]:
    """as_of가 속한, 입사일 기준 연차 사용 주기(1년)의 [시작일, 종료일) 을 반환한다."""
    if as_of < hire_date:
        return hire_date, hire_date
    k = full_years_between(hire_date, as_of)
    start = _add_years(hire_date, k)
    end = _add_years(hire_date, k + 1)
    return start, end


def count_business_days(start: date, end: date) -> int:
    """시작일~종료일(포함) 사이의 평일(월~금) 수를 센다."""
    if end < start:
        return 0
    days = 0
    current = start
    while current <= end:
        if current.weekday() < 5:  # 0=Mon ... 4=Fri
            days += 1
        current += timedelta(days=1)
    return days
