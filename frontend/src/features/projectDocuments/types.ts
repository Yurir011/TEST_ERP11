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

export type ApprovalRoute = "chief" | "manager" | "self_decision";

export const APPROVAL_ROUTE_LABELS: Record<ApprovalRoute, string> = {
  chief: "소장",
  manager: "과장",
  self_decision: "전결",
};

export interface Approver {
  id: number;
  name: string;
  grade: string;
}

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
  client_name: string;
  manager_name: string | null;
  items: ProjectDocumentItem[];
  has_pdf: boolean;
  status: ProjectDocumentStatus;
  approval_route: ApprovalRoute | null;
  approver_id: number | null;
  approver_name: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  client_contact_email: string | null;
  created_by: number;
  created_at: string;
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
