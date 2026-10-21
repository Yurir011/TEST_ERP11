import { describe, expect, it } from "vitest";
import { formatServiceLength, formatSignedDays } from "./leaveBalance";

describe("연차 표시 도우미", () => {
  it("일수는 부호와 함께, 마이너스는 그대로 보여 준다", () => {
    expect(formatSignedDays(2)).toBe("+2일");
    expect(formatSignedDays(-1)).toBe("-1일");
    expect(formatSignedDays(0)).toBe("0일");
    expect(formatSignedDays(8, false)).toBe("8일");
    expect(formatSignedDays(-3, false)).toBe("-3일");
  });

  it("근속은 입사일부터 오늘까지의 년·개월이다", () => {
    const today = new Date(2026, 9, 21); // 2026-10-21
    expect(formatServiceLength("2020-10-21", today)).toBe("6년");
    expect(formatServiceLength("2024-07-01", today)).toBe("2년 3개월");
    expect(formatServiceLength("2026-06-30", today)).toBe("3개월");
    expect(formatServiceLength("2026-10-10", today)).toBe("1개월 미만");
  });
});
