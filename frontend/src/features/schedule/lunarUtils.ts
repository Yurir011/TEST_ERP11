import { Lunar, LunarMonth, LunarYear, Solar } from "lunar-javascript";
import { toISODate } from "./dateUtils";

/** 반복 일정 최대 회차 (backend MAX_OCCURRENCES와 동일하게 유지). */
export const MAX_OCCURRENCES = 366;

export interface LunarDate {
  year: number;
  month: number; // 1~12 (항상 양수, 윤달 여부는 isLeap로 별도 표시)
  day: number;
  isLeap: boolean;
}

/** 해당 음력 연도에 윤달이 있으면 그 월(1~12)을, 없으면 0을 반환한다. */
export function getLeapMonthOfYear(lunarYear: number): number {
  return LunarYear.fromYear(lunarYear).getLeapMonth();
}

/** 해당 음력 연/월(+윤달 여부)의 일수(29 또는 30)를 반환한다. 존재하지 않는 조합이면 null. */
export function getLunarMonthDayCount(lunarYear: number, lunarMonth: number, isLeap: boolean): number | null {
  const month = LunarMonth.fromYm(lunarYear, isLeap ? -lunarMonth : lunarMonth);
  return month ? month.getDayCount() : null;
}

/** 음력 날짜 -> 양력 Date. 존재하지 않는 조합(예: 그 해에 없는 윤달)이면 null. */
export function lunarToSolar(lunarYear: number, lunarMonth: number, lunarDay: number, isLeap: boolean): Date | null {
  try {
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -lunarMonth : lunarMonth, lunarDay);
    const solar = lunar.getSolar();
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
  } catch {
    return null;
  }
}

/** 양력 Date -> 음력 날짜. */
export function solarToLunar(date: Date): LunarDate {
  const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar();
  const rawMonth = lunar.getMonth();
  return { year: lunar.getYear(), month: Math.abs(rawMonth), day: lunar.getDay(), isLeap: rawMonth < 0 };
}

/**
 * 음력 (월,일,윤달여부)를 고정하고 매년 반복되는 양력 날짜를 계산한다.
 * 윤달을 선택한 경우, 윤달이 없는 해는 건너뛴다(그 해에는 대응하는 날짜가 존재하지 않으므로).
 * `untilSolar`(포함)를 넘어가거나 MAX_OCCURRENCES에 도달하면 멈춘다.
 */
export function generateLunarYearlyOccurrences(
  startLunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeap: boolean,
  untilSolar: Date
): string[] {
  const dates: string[] = [];
  let year = startLunarYear;
  // 윤달 매칭 실패로 계속 건너뛰는 경우까지 대비해 넉넉히 안전 상한을 둔다.
  const safetyLimit = startLunarYear + MAX_OCCURRENCES * 3;

  while (dates.length < MAX_OCCURRENCES && year <= safetyLimit) {
    const solar = lunarToSolar(year, lunarMonth, lunarDay, isLeap);
    if (solar) {
      if (solar > untilSolar) break;
      dates.push(toISODate(solar));
    }
    year += 1;
  }
  return dates;
}
