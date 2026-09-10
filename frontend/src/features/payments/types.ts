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
  created_at: string;
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
