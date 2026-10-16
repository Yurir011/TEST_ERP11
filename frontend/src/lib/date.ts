// 날짜 유틸. 사용자가 보는 "오늘"은 브라우저(사무실 PC)의 로컬 시간 기준이다.
// new Date().toISOString() 은 UTC 기준이라 한국 시간 00:00~09:00 에는 전날 날짜가 나오므로 쓰지 않는다.

/** Date 를 로컬 시간 기준 "YYYY-MM-DD" 로 바꾼다. */
export function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 오늘 날짜 (로컬 시간 기준 "YYYY-MM-DD"). */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/** input[type=month] 용 "YYYY-MM". */
export function toMonthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
