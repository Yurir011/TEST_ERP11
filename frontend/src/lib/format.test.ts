import { describe, expect, it } from "vitest";
import { formatCurrency, isAutoClockOut } from "./format";

describe("formatCurrency", () => {
  it("원화 기호와 천 단위 구분", () => {
    expect(formatCurrency(0)).toBe("₩0");
    expect(formatCurrency(1234567)).toBe("₩1,234,567");
  });
});

describe("isAutoClockOut", () => {
  it("정확히 17:00:00(KST)이면 자동퇴근", () => {
    expect(isAutoClockOut("2026-11-24T17:00:00+09:00")).toBe(true);
    expect(isAutoClockOut("2026-11-24T17:00:05+09:00")).toBe(false);
    expect(isAutoClockOut("2026-11-24T18:30:12.345+09:00")).toBe(false);
    expect(isAutoClockOut(null)).toBe(false);
  });
});
