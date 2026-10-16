import { describe, expect, it } from "vitest";
import { descriptionFields, needsCustomText, needsManualItem, resolveDescription, usesProof, validatePaymentForm } from "./paymentForm";

const valid = {
  category: "소모품비" as const,
  item: "",
  customText: "",
  manualItem: "볼펜",
  method: "cash" as const,
  proofType: null,
  proofTypeDetail: "",
  cardType: null,
  bankType: null,
};

describe("paymentForm", () => {
  it("증빙 선택은 계좌이체·현금만", () => {
    expect(["bank_transfer", "cash", "corporate_card", "other"].map((m) => usesProof(m as never))).toEqual([true, true, false, false]);
  });

  it("저장된 분류·내용 → 입력란", () => {
    expect(descriptionFields("인건비", "급여")).toEqual({ category: "인건비", item: "급여", customText: "", manualItem: "" });
    expect(descriptionFields("인건비", "명절 상여")).toEqual({ category: "인건비", item: "기타", customText: "명절 상여", manualItem: "" });
    expect(descriptionFields("소모품비", "볼펜")).toEqual({ category: "소모품비", item: "", customText: "", manualItem: "볼펜" });
    expect(descriptionFields("없는분류", "x").category).toBe("소모품비"); // 알 수 없는 분류는 첫 분류로
  });

  it("입력란 → 저장할 내용, 입력 방식 판별", () => {
    expect(needsManualItem("소모품비")).toBe(true);
    expect(needsManualItem("차량")).toBe(false);
    expect(needsCustomText("차량", "기타")).toBe(true);
    expect(needsCustomText("차량", "주유비")).toBe(false);
    expect(resolveDescription({ category: "소모품비", item: "", customText: "", manualItem: " 볼펜 " })).toBe("볼펜");
    expect(resolveDescription({ category: "차량", item: "기타", customText: " 세차 ", manualItem: "" })).toBe("세차");
    expect(resolveDescription({ category: "차량", item: "주유비", customText: "무시", manualItem: "" })).toBe("주유비");
  });

  it("저장 전 검사: 순서대로 첫 문제를 알려준다", () => {
    expect(validatePaymentForm(valid)).toBeNull();
    expect(validatePaymentForm({ ...valid, proofType: "other", proofTypeDetail: " " })).toBe("증빙 종류를 '기타'로 선택한 경우 내용을 입력해주세요.");
    expect(validatePaymentForm({ ...valid, method: "corporate_card", proofType: "other" })).toBe("카드 종류를 선택해주세요."); // 카드는 증빙 검사 안 함
    expect(validatePaymentForm({ ...valid, method: "bank_transfer" })).toBe("계좌 종류를 선택해주세요.");
    expect(validatePaymentForm({ ...valid, category: "차량", manualItem: "" })).toBe("항목을 선택해주세요.");
    expect(validatePaymentForm({ ...valid, category: "차량", item: "기타" })).toBe("내용을 직접 입력해주세요.");
    expect(validatePaymentForm({ ...valid, manualItem: "  " })).toBe("항목을 입력해주세요.");
  });
});
