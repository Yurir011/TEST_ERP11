import { describe, expect, it } from "vitest";
import { koreanNumber } from "./korean";

describe("koreanNumber", () => {
  it("금액을 한글로 읽는다", () => {
    expect(koreanNumber(222000000)).toBe("이억이천이백만");
    expect(koreanNumber(1234567)).toBe("백이십삼만사천오백육십칠");
    expect(koreanNumber(10000)).toBe("일만");
    expect(koreanNumber(100000000)).toBe("일억");
    expect(koreanNumber(1000)).toBe("천");
    expect(koreanNumber(15)).toBe("십오");
    expect(koreanNumber(0)).toBe("영");
  });
  it("정수가 아니면 null", () => {
    expect(koreanNumber(1.5)).toBeNull();
    expect(koreanNumber(-1)).toBeNull();
  });
});
