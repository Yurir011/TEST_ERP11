export type PaymentType = "deposit" | "withdrawal";

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: "입금",
  withdrawal: "출금",
};

export const PAYMENT_TYPE_STYLES: Record<PaymentType, string> = {
  deposit: "bg-tile-green text-tile-green-fg",
  withdrawal: "bg-red-50 text-danger",
};

export type PaymentMethod = "corporate_card" | "cash" | "bank_transfer" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  corporate_card: "법인카드",
  cash: "현금",
  bank_transfer: "계좌이체",
  other: "기타",
};

// 계좌이체 건의 증빙(영수증/세금계산서 등) 발행 종류
export type ProofType = "tax_invoice" | "expense_receipt" | "simple_receipt" | "other";

export const PROOF_TYPE_LABELS: Record<ProofType, string> = {
  tax_invoice: "세금계산서",
  expense_receipt: "지출증빙영수증",
  simple_receipt: "간이영수증",
  other: "기타",
};

// 법인카드 건의 카드 종류
export type CardType = "bc" | "kb_kookmin";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  bc: "BC",
  kb_kookmin: "KB국민",
};

// 계좌이체 건의 계좌 종류
export type BankType = "ibk" | "kb_kookmin" | "woori";

export const BANK_TYPE_LABELS: Record<BankType, string> = {
  ibk: "기업",
  kb_kookmin: "국민",
  woori: "우리",
};

// 입출금 분류 12개. 인건비/차량/제조만 세부 항목 콤보박스를 갖는다 (PAYMENT_CATEGORY_ITEMS 참고).
export const PAYMENT_CATEGORIES = [
  "소모품비",
  "공과금",
  "복리후생비",
  "지급수수료",
  "인건비",
  "차량",
  "제조",
  "외상매출금",
  "외상매입금",
  "선수금",
  "미지급금",
  "기타",
] as const;

export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

// 분류별 세부 항목. 여기 없는 분류는 항목 선택 없이 분류명 자체가 내용(description)이 된다.
// "기타" 항목이 포함된 분류(인건비/차량)는 기타 선택 시 직접 입력란이 나타난다.
export const PAYMENT_CATEGORY_ITEMS: Partial<Record<PaymentCategory, string[]>> = {
  인건비: ["급여", "인건비3.3%", "기타"],
  차량: ["주유비", "유지관리비", "기타"],
  제조: ["원재료", "부재료", "소모품"],
};

export interface Payment {
  id: number;
  type: PaymentType;
  payment_date: string;
  category: string;
  description: string;
  amount: number;
  method: PaymentMethod;
  client_id: number | null;
  client_name: string | null;
  has_receipt: boolean;
  memo: string | null;
  proof_type: ProofType | null;
  proof_type_detail: string | null;
  card_type: CardType | null;
  bank_type: BankType | null;
  created_at: string;
}

export function paymentMethodDetailLabel(p: Payment): string {
  const base = PAYMENT_METHOD_LABELS[p.method];
  if (p.method === "corporate_card" && p.card_type) return `${base} (${CARD_TYPE_LABELS[p.card_type]})`;
  if (p.method === "bank_transfer" && p.bank_type) return `${base} (${BANK_TYPE_LABELS[p.bank_type]})`;
  return base;
}

export interface PaymentReport {
  year: number;
  month: number;
  total_deposit: number;
  total_withdrawal: number;
  net: number;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
