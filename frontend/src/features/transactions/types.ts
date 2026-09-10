export type TransactionType = "sales" | "purchase";

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  sales: "매출",
  purchase: "매입",
};

export const TX_TYPE_STYLES: Record<TransactionType, string> = {
  sales: "bg-tile-green text-tile-green-fg",
  purchase: "bg-tile-orange text-tile-orange-fg",
};

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
  created_at: string;
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
