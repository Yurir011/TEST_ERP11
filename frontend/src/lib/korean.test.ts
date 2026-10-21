import { describe, expect, it } from "vitest";
import { objectParticle } from "./korean";

describe("목적격 조사", () => {
  it("받침이 있으면 을, 없으면 를", () => {
    expect(objectParticle("구매")).toBe("를");
    expect(objectParticle("출장")).toBe("을");
    expect(objectParticle("모니터 구입")).toBe("을");
    expect(objectParticle("소모품 구매")).toBe("를");
  });

  it("한글이 아니거나 비어 있으면 안전하게 처리한다", () => {
    expect(objectParticle("PCB")).toBe("을(를)");
    expect(objectParticle("")).toBe("을");
  });
});
