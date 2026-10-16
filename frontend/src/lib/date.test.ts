import { describe, expect, it } from "vitest";
import { toLocalISODate, toMonthValue } from "./date";

describe("toLocalISODate", () => {
  it("로컬 시간 기준 날짜를 돌려준다 (자정 직후에도 전날이 되지 않는다)", () => {
    // 로컬 시간으로 만든 Date 라서 실행 환경의 시간대와 상관없이 같은 결과여야 한다
    expect(toLocalISODate(new Date(2026, 9, 16, 0, 30))).toBe("2026-10-16");
    expect(toLocalISODate(new Date(2026, 9, 16, 23, 59))).toBe("2026-10-16");
  });

  it("월·일을 두 자리로 맞춘다", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("toMonthValue", () => {
  it("YYYY-MM 형식", () => {
    expect(toMonthValue(2026, 3)).toBe("2026-03");
    expect(toMonthValue(2026, 12)).toBe("2026-12");
  });
});
