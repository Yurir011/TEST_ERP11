import { describe, expect, it } from "vitest";
import { changeText } from "./ProjectDeliveryStatsPage";

describe("납품 통계 증감률", () => {
  it("작년 대비 증감을 퍼센트로 보여 준다", () => {
    expect(changeText(5830, 4010)).toBe("+45%");
    expect(changeText(3000, 4000)).toBe("-25%");
    expect(changeText(100, 100)).toBe("+0%");
  });
  it("작년 값이 0이면 비교하지 않는다", () => {
    expect(changeText(100, 0)).toBeNull();
  });
});
