import { describe, expect, it } from "vitest";
import { fieldLabel, formatAuditValue, targetLabel } from "./auditLabels";

describe("formatAuditValue", () => {
  it("숫자는 천 단위, 불리언은 예/아니오, 빈 값은 —", () => {
    expect(formatAuditValue(550000)).toBe("550,000");
    expect(formatAuditValue(true)).toBe("예");
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue("")).toBe("—");
  });

  it("알려진 코드 값은 한국어로, 배열은 쉼표로", () => {
    expect(formatAuditValue("withdrawal")).toBe("출금");
    expect(formatAuditValue(["clients", "payments"])).toBe("거래처, 입출금");
    expect(formatAuditValue([])).toBe("(없음)");
    expect(formatAuditValue("임의 문자열")).toBe("임의 문자열");
  });
});

describe("labels", () => {
  it("필드 이름은 한국어로, 모르는 필드는 그대로", () => {
    expect(fieldLabel("payable_amount")).toBe("미지급금");
    expect(fieldLabel("unknown_field")).toBe("unknown_field");
  });

  it("대상 표시: 로그인 기록은 '로그인'", () => {
    expect(targetLabel({ entity_type: "client", entity_id: 7, action: "update" })).toBe("거래처 #7");
    expect(targetLabel({ entity_type: "user", entity_id: 3, action: "login_failed" })).toBe("로그인");
  });
});
