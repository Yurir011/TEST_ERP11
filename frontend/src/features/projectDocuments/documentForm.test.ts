import { describe, expect, it } from "vitest";
import {
  OTHER_PROJECT,
  formItemAmount,
  formTotals,
  isProjectDocType,
  projectPayload,
  scannedCounterparty,
  toItemFormValues,
  toItemsPayload,
} from "./documentForm";
import type { TaxInvoiceOcrResult } from "./types";

const form = (quantity: string, unit_price: string, content = "품목", note = "") => ({ content, quantity, unit_price, note });

describe("documentForm", () => {
  it("문서 종류 판별", () => {
    expect(["quotation", "statement", "tax_invoice", "purchase_order"].every(isProjectDocType)).toBe(true);
    expect(isProjectDocType("set")).toBe(false);
    expect(isProjectDocType(null)).toBe(false);
  });

  it("저장된 품목 ↔ 입력란 값", () => {
    expect(toItemFormValues([{ id: 1, content: "A", quantity: 2, unit_price: 1500.5, note: null, sort_order: 0 }] as never)).toEqual([
      { content: "A", quantity: "2", unit_price: "1500.5", note: "" },
    ]);
    expect(toItemsPayload([form("3", "1,000"), form("", "abc", "B", "비고")])).toEqual([
      { content: "품목", quantity: 3, unit_price: 0, note: null }, // 숫자로 바꿀 수 없으면 0
      { content: "B", quantity: 0, unit_price: 0, note: "비고" },
    ]);
  });

  it("관련 프로젝트 → 요청 값", () => {
    expect(projectPayload("12", "무시됨")).toEqual({ project_id: 12, project_other_name: null });
    expect(projectPayload(OTHER_PROJECT, "  샘플 납품 ")).toEqual({ project_id: null, project_other_name: "샘플 납품" });
  });

  it("금액: 품목별 반올림 후 합산, 부가세 10%", () => {
    expect(formItemAmount(form("3", "454545.5"))).toBe(1_363_637);
    expect(formTotals([form("3", "454545.5"), form("1", "1000"), form("", "")])).toEqual({
      subtotal: 1_364_637,
      vat: 136_464,
      total: 1_501_101,
    });
    // 서버와 같은 사사오입: 15 × 4.1 은 소수 곱셈으로 61.49999… 이지만 62 로 저장된다
    expect(formItemAmount(form("15", "4.1"))).toBe(62);
  });

  it("사진 인식 상대방: 매입이면 공급자, 매출이면 공급받는자", () => {
    const scan = { supplier: { name: "공급자" }, recipient: { name: "받는자" } } as TaxInvoiceOcrResult;
    expect(scannedCounterparty("tax_invoice", scan, "purchase")?.name).toBe("공급자");
    expect(scannedCounterparty("tax_invoice", scan, "sales")?.name).toBe("받는자");
    expect(scannedCounterparty("tax_invoice", scan, null)).toBeNull();
    expect(scannedCounterparty("quotation", scan, "sales")).toBeNull();
    expect(scannedCounterparty("tax_invoice", null, "sales")).toBeNull();
  });
});
