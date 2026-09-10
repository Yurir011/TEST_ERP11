export type ProjectStatus = "estimate" | "in_progress" | "completed";

export interface Project {
  id: number;
  name: string;
  client_id: number;
  client_name: string;
  status: ProjectStatus;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  estimate: "견적",
  in_progress: "진행",
  completed: "완료",
};

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  estimate: "bg-tile-orange text-tile-orange-fg",
  in_progress: "bg-tile-blue text-tile-blue-fg",
  completed: "bg-tile-green text-tile-green-fg",
};

export type SalesDocType = "estimate" | "statement";

export const SALES_DOC_LABELS: Record<SalesDocType, string> = {
  estimate: "견적서",
  statement: "거래명세서",
};

export interface SalesDocumentItem {
  id: number;
  name: string;
  spec: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface SalesDocument {
  id: number;
  project_id: number;
  project_name: string;
  client_name: string;
  set_id: number;
  doc_type: SalesDocType;
  doc_no: string;
  issue_date: string;
  notes: string | null;
  subtotal: number;
  vat: number;
  total: number;
  created_at: string;
  items: SalesDocumentItem[];
}

export interface SalesDocumentSet {
  set_id: number;
  estimate: SalesDocument;
  statement: SalesDocument;
}
