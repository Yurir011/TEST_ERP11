import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("원화 기호와 천 단위 구분", () => {
    expect(formatCurrency(0)).toBe("₩0");
    expect(formatCurrency(1234567)).toBe("₩1,234,567");
  });
});
