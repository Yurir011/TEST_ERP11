import { Lunar, Solar } from "lunar-javascript";
import { addDays, toISODate } from "./dateUtils";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "신정" },
  { month: 3, day: 1, name: "삼일절" },
  { month: 5, day: 5, name: "어린이날" },
  { month: 6, day: 6, name: "현충일" },
  { month: 8, day: 15, name: "광복절" },
  { month: 10, day: 3, name: "개천절" },
  { month: 10, day: 9, name: "한글날" },
  { month: 12, day: 25, name: "크리스마스" },
];

function lunarToSolarDate(year: number, month: number, day: number): Date {
  const solar = Lunar.fromYmd(year, month, day).getSolar();
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
}

const holidayCache = new Map<number, Holiday[]>();

/** 고정 양력 공휴일 + 음력 기반 공휴일(설날·추석 연휴, 부처님오신날)을 계산한다.
 * 대체공휴일(대체휴일 규정)은 계산하지 않는다 — 연도별 규정이 복잡해 정확도를 보장하기 어려움. */
export function getHolidaysForYear(year: number): Holiday[] {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays: Holiday[] = FIXED_HOLIDAYS.map((h) => ({
    date: toISODate(new Date(year, h.month - 1, h.day)),
    name: h.name,
  }));

  const seollal = lunarToSolarDate(year, 1, 1);
  holidays.push({ date: toISODate(addDays(seollal, -1)), name: "설날 연휴" });
  holidays.push({ date: toISODate(seollal), name: "설날" });
  holidays.push({ date: toISODate(addDays(seollal, 1)), name: "설날 연휴" });

  const chuseok = lunarToSolarDate(year, 8, 15);
  holidays.push({ date: toISODate(addDays(chuseok, -1)), name: "추석 연휴" });
  holidays.push({ date: toISODate(chuseok), name: "추석" });
  holidays.push({ date: toISODate(addDays(chuseok, 1)), name: "추석 연휴" });

  const buddha = lunarToSolarDate(year, 4, 8);
  holidays.push({ date: toISODate(buddha), name: "부처님오신날" });

  holidayCache.set(year, holidays);
  return holidays;
}

export function getHolidayMap(years: number[]): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const year of years) {
    for (const h of getHolidaysForYear(year)) {
      if (!map.has(h.date)) map.set(h.date, h);
    }
  }
  return map;
}

/** 매월 1일 등에 표시할 작은 음력 날짜 라벨 (예: "음 7.20") */
export function getLunarLabel(date: Date): string {
  const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar();
  return `음 ${lunar.getMonth()}.${lunar.getDay()}`;
}
