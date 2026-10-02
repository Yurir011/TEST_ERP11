import type { ApprovalStep } from "../../components/approval/types";

export type ProjectDocType = "quotation" | "statement" | "tax_invoice";

export const PROJECT_DOC_TYPE_LABELS: Record<ProjectDocType, string> = {
  quotation: "견적서",
  statement: "거래명세서",
  tax_invoice: "세금계산서",
};

export type ProjectDocumentStatus = "draft" | "pending" | "approved" | "rejected";

export const PROJECT_DOC_STATUS_LABELS: Record<ProjectDocumentStatus, string> = {
  draft: "초안",
  pending: "결재 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const PROJECT_DOC_STATUS_STYLES: Record<ProjectDocumentStatus, string> = {
  draft: "bg-tile-orange text-tile-orange-fg",
  pending: "bg-tile-blue text-tile-blue-fg",
  approved: "bg-tile-green text-tile-green-fg",
  rejected: "bg-red-50 text-danger",
};

export interface Approver {
  id: number;
  name: string;
  title: "team_lead" | "ceo";
}

export type DocCurrency = "KRW" | "USD" | "JPY";

export const DOC_CURRENCY_LABELS: Record<DocCurrency, string> = {
  KRW: "원 (KRW)",
  USD: "달러 (USD)",
  JPY: "엔 (JPY)",
};

export const DOC_CURRENCY_SYMBOLS: Record<DocCurrency, string> = {
  KRW: "₩",
  USD: "$",
  JPY: "¥",
};

export type TaxInvoicePurpose = "청구" | "영수";

export const TAX_INVOICE_PURPOSE_HELP: Record<TaxInvoicePurpose, string> = {
  청구: "대금 입금 전, 청구용으로 발행",
  영수: "대금 입금 후, 영수증 대용으로 발행",
};

export interface ProjectDocumentItem {
  id: number;
  content: string;
  quantity: number;
  unit_price: number;
  note: string | null;
}

export interface ProjectDocument {
  id: number;
  project_id: number;
  project_name: string;
  doc_type: ProjectDocType;
  issue_date: string;
  doc_no: string | null;
  currency: DocCurrency;
  purpose_type: TaxInvoicePurpose;
  client_name: string;
  manager_name: string | null;
  items: ProjectDocumentItem[];
  has_pdf: boolean;
  set_id: number | null;
  has_excel: boolean;
  status: ProjectDocumentStatus;
  current_step: number;
  steps: ApprovalStep[];
  approver_id: number | null;
  approver_name: string | null;
  is_final_decision: boolean;
  reviewed_at: string | null;
  reject_reason: string | null;
  client_contact_email: string | null;
  created_by: number;
  created_at: string;
  popbill_issued: boolean;
  popbill_nts_confirm_num: string | null;
  popbill_issued_at: string | null;
  payment_recorded: boolean;
}

export interface ProjectDocumentItemFormValues {
  content: string;
  quantity: string;
  unit_price: string;
  note: string;
}

export const EMPTY_PROJECT_DOC_ITEM: ProjectDocumentItemFormValues = {
  content: "",
  quantity: "1",
  unit_price: "0",
  note: "",
};

export const MAX_PROJECT_DOC_ITEMS = 8;
