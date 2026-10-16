import type {
  ProjectDocType,
  ProjectDocumentItem,
  ProjectDocumentItemFormValues,
  TaxInvoiceParty,
  TaxInvoiceOcrResult,
} from "./types";

// 문서 작성 화면(ProjectDocumentFormPage)의 순수 변환·계산 함수 (화면 상태와 분리).

/** 관련 프로젝트 "기타(직접 입력)" 선택 값 */
export const OTHER_PROJECT = "other";

export function isProjectDocType(value: string | null): value is ProjectDocType {
  return value === "quotation" || value === "statement" || value === "tax_invoice" || value === "purchase_order";
}

/** 저장된 문서의 품목 → 입력란 값 (수정 불러오기, 견적서 불러오기) */
export function toItemFormValues(items: ProjectDocumentItem[]): ProjectDocumentItemFormValues[] {
  return items.map((it) => ({
    content: it.content,
    quantity: String(it.quantity),
    unit_price: String(it.unit_price),
    note: it.note ?? "",
  }));
}

/** 입력란 값 → API 로 보낼 품목 */
export function toItemsPayload(items: ProjectDocumentItemFormValues[]) {
  return items.map((it) => ({
    content: it.content,
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    note: it.note || null,
  }));
}

/** 관련 프로젝트 선택 값 → API 의 project_id / project_other_name */
export function projectPayload(projectId: string, projectOtherName: string) {
  return {
    project_id: projectId === OTHER_PROJECT ? null : Number(projectId),
    project_other_name: projectId === OTHER_PROJECT ? projectOtherName.trim() : null,
  };
}

/** 품목 금액 = 수량 x 단가 (원 단위 반올림) */
export function formItemAmount(it: ProjectDocumentItemFormValues): number {
  return Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
}

/** 공급가액(품목 금액 합) · 부가세 10% · 합계 */
export function formTotals(items: ProjectDocumentItemFormValues[]) {
  const subtotal = items.reduce((sum, it) => sum + formItemAmount(it), 0);
  const vat = Math.round(subtotal * 0.1);
  return { subtotal, vat, total: subtotal + vat };
}

/** 사진에서 인식한 상대방(우리 회사가 아닌 쪽) 정보. 세금계산서이고 매입/매출이 정해졌을 때만 보낸다. */
export function scannedCounterparty(
  docType: ProjectDocType,
  scan: TaxInvoiceOcrResult | null,
  direction: "sales" | "purchase" | null
): TaxInvoiceParty | null {
  if (docType !== "tax_invoice" || !scan || !direction) return null;
  return direction === "purchase" ? scan.supplier : scan.recipient;
}
