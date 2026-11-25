import { describe, expect, it } from "vitest";
import { getHolidaysForYear } from "./holidays";

const names = (year: number, prefix: string) => getHolidaysForYear(year).filter((h) => h.date.startsWith(prefix));

describe("제헌절 공휴일", () => {
  it("2026년부터 7월 17일이 공휴일이다", () => {
    expect(names(2026, "2026-07")).toEqual([{ date: "2026-07-17", name: "제헌절" }]);
  });

  it("2025년 이전에는 공휴일이 아니다", () => {
    expect(names(2025, "2025-07")).toEqual([]);
  });

  it("토요일과 겹치면 다음 월요일이 대체공휴일이다 (2027-07-17 토 → 07-19 월)", () => {
    expect(names(2027, "2027-07")).toEqual([
      { date: "2027-07-17", name: "제헌절" },
      { date: "2027-07-19", name: "대체공휴일(제헌절)" },
    ]);
  });
});
