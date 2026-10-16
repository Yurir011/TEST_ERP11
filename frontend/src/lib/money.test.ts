import { describe, expect, it } from "vitest";
import { lineAmount, roundHalfUp, vatAmount } from "./money";

// 서버(backend/tests/test_money.py)와 같은 결과여야 한다.
describe("money", () => {
  it("사사오입: 0.5 는 항상 올림, 음수는 0에서 먼 쪽", () => {
    expect([0.5, 1.5, 2.5, 2.4999, -2.5, -2.4].map(roundHalfUp)).toEqual([1, 2, 3, 2, -3, -2]);
  });

  it("품목 금액: 소수 곱셈 오차 없이 계산", () => {
    expect(lineAmount(15, 4.1)).toBe(62); // 15 * 4.1 = 61.49999… 로 계산되면 61 이 된다
    expect(lineAmount(15, 33.3)).toBe(500);
    expect(lineAmount(10, 1.15)).toBe(12);
    expect(lineAmount(3, 454545.5)).toBe(1_363_637);
    expect(lineAmount(2, 50_000.4)).toBe(100_001);
    expect(lineAmount(0, 123.45)).toBe(0);
  });

  it("품목 금액: 수량 1~200, 단가 0.05 단위 전 구간에서 정수 계산과 같다", () => {
    let mismatches = 0;
    for (let q = 1; q <= 200; q++) {
      for (let cents = 5; cents <= 20_000; cents += 5) {
        if (lineAmount(q, cents / 100) !== Math.floor((q * cents + 50) / 100)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("부가세 10%", () => {
    expect([0, 4, 5, 15, 1005, 101_501, 1_364_637].map(vatAmount)).toEqual([0, 0, 1, 2, 101, 10_150, 136_464]);
    expect(vatAmount(-15)).toBe(-2);
  });
});
