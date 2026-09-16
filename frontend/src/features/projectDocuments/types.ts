export type ProjectDocType = "quotation" | "statement" | "tax_invoice";

export const PROJECT_DOC_TYPE_LABELS: Record<ProjectDocType, string> = {
  quotation: "견적서",
  statement: "거래명세서",
  tax_invoice: "세금계산서",
};

// 자동 생성 엑셀 파일의 확장자 (백엔드 EXCEL_FILE_INFO와 일치)
export const PROJECT_DOC_EXCEL_EXT: Record<ProjectDocType, string> = {
  quotation: ".xls",
  statement: ".xlsx",
  tax_invoice: ".xlsx",
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
  client_name: string;
  manager_name: string | null;
  items: ProjectDocumentItem[];
  has_excel: boolean;
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
