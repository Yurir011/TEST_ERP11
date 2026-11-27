import { SOFT_BADGE } from "../../components/ui/softBadge";

export type ProjectStatus = "estimate" | "in_progress" | "completed" | "discarded";

export interface Project {
  id: number;
  name: string;
  client_id: number;
  client_name: string;
  status: ProjectStatus;
  memo: string | null;
  discard_reason: string | null; // 폐기 사유 (상태가 폐기일 때만)
  start_date: string | null;
  end_date: string | null;
  progress_percent: number;
  creator_name: string;
  created_at: string;
  updated_at: string;
  series_id: number | null; // 같은 프로젝트의 반복(회차) 묶음 번호, 단독이면 null
  round_no: number | null; // 회차 번호 (묶음에 속한 프로젝트, 해와 상관없이 시작일 순)
  round_label?: string | null; // 회차 탭 이름(직접 지정). 없으면 "N회차"
  round_total: number | null; // 같은 묶음의 회차 수
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  estimate: "견적",
  in_progress: "진행",
  completed: "완료",
  discarded: "폐기",
};

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  estimate: SOFT_BADGE.orange,
  in_progress: SOFT_BADGE.blue,
  completed: SOFT_BADGE.green,
  discarded: SOFT_BADGE.gray,
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

export const MAX_PROGRESS_STAGES = 10;

export interface ProgressStage {
  id: number;
  name: string;
  order_index: number;
  progress_percent: number;
  completed_on: string | null;
  start_date: string | null;
  end_date: string | null;
}

export type PurchaseStepKey = "request" | "approval" | "purchase" | "payment" | "delivery";

export interface PurchaseStep {
  id: number;
  step_key: PurchaseStepKey;
  label: string;
  order_index: number;
  is_done: boolean;
  completed_on: string | null;
}

/** 프로젝트(회차)의 납품 기록 한 건. 저장하면 곧바로 납품완료로 본다. */
export interface Delivery {
  id: number;
  project_id: number;
  delivered_on: string;
  quantity: number;
  memo: string | null;
  created_at: string;
}

export interface DeliveryList {
  items: Delivery[];
  total_count: number;
  total_quantity: number;
}

export interface DeliveryMonthStat {
  month: number;
  count: number;
  quantity: number;
}

export interface DeliveryProjectStat {
  project_id: number;
  name: string;
  client_name: string;
  count: number;
  quantity: number;
  months: DeliveryMonthStat[];
}

/** 연간 납품 통계 (GET /api/projects/delivery-stats) */
export interface DeliveryStats {
  year: number;
  years: number[];
  total_count: number;
  total_quantity: number;
  project_count: number;
  client_count: number;
  prev_count: number;
  prev_quantity: number;
  monthly: DeliveryMonthStat[];
  projects: DeliveryProjectStat[];
}
