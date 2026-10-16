import { PAYMENT_CATEGORIES, PAYMENT_CATEGORY_ITEMS, type BankType, type CardType, type PaymentCategory, type PaymentMethod, type ProofType } from "./types";

// 입출금 등록/수정 화면(PaymentFormPage)의 순수 변환·검사 함수 (화면 상태와 분리).

/** 증빙(세금계산서/영수증 등) 발행 여부는 계좌이체와 현금 건에서 선택한다. */
export function usesProof(method: PaymentMethod): boolean {
  return method === "bank_transfer" || method === "cash";
}

/** 분류·항목 입력란 상태 */
export interface DescriptionFields {
  category: PaymentCategory;
  item: string;
  customText: string;
  manualItem: string;
}

/** 저장된 분류·내용 → 입력란 상태 (수정 화면 불러오기).
 * 항목 목록이 있는 분류는 목록에 있으면 그 항목, 없으면 "기타" + 직접 입력. 목록이 없는 분류는 항목 칸에 그대로. */
export function descriptionFields(category: string, description: string): DescriptionFields {
  const cat = (PAYMENT_CATEGORIES as readonly string[]).includes(category) ? (category as PaymentCategory) : PAYMENT_CATEGORIES[0];
  const items = PAYMENT_CATEGORY_ITEMS[cat];
  if (!items) return { category: cat, item: "", customText: "", manualItem: description };
  if (items.includes(description)) return { category: cat, item: description, customText: "", manualItem: "" };
  return { category: cat, item: "기타", customText: description, manualItem: "" };
}

/** 항목 목록이 없는 분류(기타 포함)는 "항목" 칸에 직접 입력한다. */
export function needsManualItem(category: PaymentCategory): boolean {
  return !PAYMENT_CATEGORY_ITEMS[category];
}

/** 항목 목록이 있는 분류에서 "기타"를 고른 경우는 별도의 "내용 직접 입력" 칸을 쓴다. */
export function needsCustomText(category: PaymentCategory, item: string): boolean {
  return !needsManualItem(category) && item === "기타";
}

/** 입력란 상태 → 저장할 내용(description) */
export function resolveDescription(f: DescriptionFields): string {
  return needsManualItem(f.category) ? f.manualItem.trim() : f.item === "기타" ? f.customText.trim() : f.item;
}

/** 저장 전 입력 검사. 문제가 있으면 화면에 보여줄 문구, 없으면 null. */
export function validatePaymentForm(
  f: DescriptionFields & {
    method: PaymentMethod;
    proofType: ProofType | null;
    proofTypeDetail: string;
    cardType: CardType | null;
    bankType: BankType | null;
  }
): string | null {
  if (usesProof(f.method) && f.proofType === "other" && !f.proofTypeDetail.trim()) {
    return "증빙 종류를 '기타'로 선택한 경우 내용을 입력해주세요.";
  }
  if (f.method === "corporate_card" && !f.cardType) return "카드 종류를 선택해주세요.";
  if (f.method === "bank_transfer" && !f.bankType) return "계좌 종류를 선택해주세요.";
  if (PAYMENT_CATEGORY_ITEMS[f.category] && !f.item) return "항목을 선택해주세요.";
  if (needsCustomText(f.category, f.item) && !f.customText.trim()) return "내용을 직접 입력해주세요.";
  if (needsManualItem(f.category) && !f.manualItem.trim()) return "항목을 입력해주세요.";
  return null;
}
