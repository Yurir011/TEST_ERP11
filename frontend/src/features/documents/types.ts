import type { ApprovalStep } from "../../components/approval/types";

export type DocumentType = "employment" | "career" | "employment_en";

export type DocumentApprovalStatus = "pending" | "approved" | "rejected";

export interface DocumentRecord {
  id: number;
  user_id: number;
  user_name: string;
  doc_type: DocumentType;
  purpose: string | null;
  status: DocumentApprovalStatus;
  current_step: number;
  steps: ApprovalStep[];
  approver_id: number | null;
  approver_name: string | null;
  is_final_decision: boolean;
  reviewed_at: string | null;
  reject_reason: string | null;
  has_pdf: boolean;
  issued_at: string;
}

export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  employment: "재직증명서",
  career: "경력증명서",
  employment_en: "재직증명서 (영문)",
};
