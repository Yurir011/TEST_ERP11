import { describe, expect, it } from "vitest";
import { remainingAmount } from "./types";

describe("remainingAmount (부분 수금/지급 후 남은 금액)", () => {
  it("받은 금액을 뺀 나머지", () => {
    expect(remainingAmount({ total_amount: 1_100_000, paid_amount: 400_000 })).toBe(700_000);
  });

  it("받은 게 없으면 전액", () => {
    expect(remainingAmount({ total_amount: 550_000, paid_amount: 0 })).toBe(550_000);
  });

  it("음수가 되지 않는다", () => {
    expect(remainingAmount({ total_amount: 100, paid_amount: 150 })).toBe(0);
  });
});
