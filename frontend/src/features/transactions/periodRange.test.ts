import { describe, expect, it } from "vitest";
import { periodRange } from "./TransactionsPage";

const TODAY = new Date(2026, 9, 23); // 2026-10-23

describe("매입매출 조회 기간", () => {
  it("전체는 시작·종료일이 비어 기간 제한이 없다", () => {
    expect(periodRange("all", TODAY)).toEqual({ start: "", end: "" });
  });
  it("이번 달은 이번 달 1일부터 오늘까지", () => {
    expect(periodRange("this", TODAY)).toEqual({ start: "2026-10-01", end: "2026-10-23" });
  });
  it("지난달은 지난달 1일부터 말일까지", () => {
    expect(periodRange("last", TODAY)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(periodRange("last", new Date(2026, 0, 15))).toEqual({ start: "2025-12-01", end: "2025-12-31" }); // 1월이면 작년 12월
    expect(periodRange("last", new Date(2026, 2, 31))).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("최근 3·6·12개월은 오늘 기준 N개월 전부터 오늘까지", () => {
    expect(periodRange("3", TODAY)).toEqual({ start: "2026-07-23", end: "2026-10-23" });
    expect(periodRange("6", TODAY)).toEqual({ start: "2026-04-23", end: "2026-10-23" });
    expect(periodRange("12", TODAY)).toEqual({ start: "2025-10-23", end: "2026-10-23" });
  });
});
