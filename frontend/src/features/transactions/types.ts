import { SOFT_BADGE } from "../../components/ui/softBadge";

export type TransactionType = "sales" | "purchase";

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  sales: "매출",
  purchase: "매입",
};

export const TX_TYPE_STYLES: Record<TransactionType, string> = {
  sales: SOFT_BADGE.green,
  purchase: SOFT_BADGE.orange,
};

export interface TransactionPayment {
  id: number;
  payment_date: string;
  amount: number;
  method: string;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  transaction_date: string;
  client_id: number | null;
  client_name: string | null;
  counterparty: string | null;
  item_name: string;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  tax_invoice_no: string | null;
  memo: string | null;
  settled: boolean;
  settled_date: string | null;
  paid_amount: number; // 부분 수금/지급으로 이미 받은(준) 금액
  payment_history: TransactionPayment[]; // 부분 수금/지급 내역 (오래된 순)
  created_at: string;
}

/** 아직 결제되지 않은 금액 (부분 수금/지급을 뺀 나머지). */
export function remainingAmount(tx: Pick<Transaction, "total_amount" | "paid_amount">): number {
  return Math.max(0, tx.total_amount - (tx.paid_amount ?? 0));
}

export interface TaxInvoiceCandidate {
  id: number;
  issue_date: string;
  type: TransactionType;
  client_id: number | null;
  client_name: string;
  item_name: string;
  supply_amount: number;
  vat_amount: number;
  tax_invoice_no: string | null;
  status: string;
}

export interface VatReport {
  year: number;
  month: number;
  sales_supply: number;
  sales_vat: number;
  purchase_supply: number;
  purchase_vat: number;
  payable_vat: number;
}
