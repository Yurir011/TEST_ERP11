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

// 대체공휴일이 적용되는 고정 양력 공휴일 (관공서의 공휴일에 관한 규정 제3조).
// 신정·현충일·크리스마스·부처님오신날은 대체공휴일 대상이 아니다.
const SUBSTITUTE_ELIGIBLE_FIXED = new Set(["삼일절", "어린이날", "광복절", "개천절", "한글날"]);

function lunarToSolarDate(year: number, month: number, day: number): Date {
  const solar = Lunar.fromYmd(year, month, day).getSolar();
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
}

function fixedHolidaysOfYear(year: number): Holiday[] {
  return FIXED_HOLIDAYS.map((h) => ({ date: toISODate(new Date(year, h.month - 1, h.day)), name: h.name }));
}

interface LunarBlock {
  days: Date[]; // 연휴 3일: [전날, 당일, 다음날]
  dayName: "설날" | "추석";
}

function lunarBlocksOfYear(year: number): LunarBlock[] {
  const seollal = lunarToSolarDate(year, 1, 1);
  const chuseok = lunarToSolarDate(year, 8, 15);
  return [
    { days: [addDays(seollal, -1), seollal, addDays(seollal, 1)], dayName: "설날" },
    { days: [addDays(chuseok, -1), chuseok, addDays(chuseok, 1)], dayName: "추석" },
  ];
}

function buddhaOfYear(year: number): Holiday {
  return { date: toISODate(lunarToSolarDate(year, 4, 8)), name: "부처님오신날" };
}

const holidayCache = new Map<number, Holiday[]>();

/**
 * 고정 양력 공휴일 + 음력 공휴일(설날·추석 연휴, 부처님오신날) + 대체공휴일을 계산한다.
 * 대체공휴일 판정은 "관공서의 공휴일에 관한 규정" 제3조를 따른다.
 *  - 설날·추석 연휴(전날·당일·다음날) 중 하루가 일요일이거나 다른 공휴일과 겹치면,
 *    연휴 마지막 날 다음의 첫 번째 비공휴일이 대체공휴일이 된다.
 *  - 삼일절·어린이날·광복절·개천절·한글날이 토요일·일요일이거나 다른 공휴일과 겹치면,
 *    그 다음의 첫 번째 비공휴일이 대체공휴일이 된다.
 *  - 신정·현충일·크리스마스·부처님오신날은 대체공휴일 대상이 아니다.
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  // 연말연시에 걸친 겹침 판정을 위해 전후 1개년도도 함께 계산해둔다.
  const years = [year - 1, year, year + 1];
  const allFixed = years.flatMap(fixedHolidaysOfYear);
  const allBuddha = years.map(buddhaOfYear);
  const allLunarBlocks = years.flatMap(lunarBlocksOfYear);

  const fixedDateSet = new Set(allFixed.map((h) => h.date));
  const buddhaDateSet = new Set(allBuddha.map((h) => h.date));
  const occupied = new Set([...fixedDateSet, ...buddhaDateSet, ...allLunarBlocks.flatMap((b) => b.days.map(toISODate))]);

  function isFreeDay(d: Date): boolean {
    return d.getDay() !== 0 && !occupied.has(toISODate(d));
  }

  function nextFreeDayAfter(d: Date): Date {
    let candidate = addDays(d, 1);
    while (!isFreeDay(candidate)) candidate = addDays(candidate, 1);
    occupied.add(toISODate(candidate)); // 연쇄적으로 겹치는 대체공휴일도 순서대로 비켜가도록 즉시 점유 처리
    return candidate;
  }

  const substitutes: Holiday[] = [];

  for (const h of allFixed) {
    if (!SUBSTITUTE_ELIGIBLE_FIXED.has(h.name)) continue;
    const d = new Date(`${h.date}T00:00:00`);
    const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
    const overlapsOtherHoliday = allFixed.some((o) => o !== h && o.date === h.date) || buddhaDateSet.has(h.date);
    if (isWeekendDay || overlapsOtherHoliday) {
      substitutes.push({ date: toISODate(nextFreeDayAfter(d)), name: `대체공휴일(${h.name})` });
    }
  }

  for (const block of allLunarBlocks) {
    const triggered = block.days.some((d) => {
      if (d.getDay() === 0) return true;
      const iso = toISODate(d);
      return fixedDateSet.has(iso) || buddhaDateSet.has(iso);
    });
    if (!triggered) continue;
    const blockEnd = block.days[block.days.length - 1];
    substitutes.push({ date: toISODate(nextFreeDayAfter(blockEnd)), name: `대체공휴일(${block.dayName})` });
  }

  const holidays: Holiday[] = [
    ...fixedHolidaysOfYear(year),
    ...lunarBlocksOfYear(year).flatMap((b) =>
      b.days.map((d, i) => ({ date: toISODate(d), name: i === 1 ? b.dayName : `${b.dayName} 연휴` }))
    ),
    buddhaOfYear(year),
    ...substitutes.filter((s) => s.date.startsWith(String(year))),
  ].sort((a, b) => a.date.localeCompare(b.date));

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
