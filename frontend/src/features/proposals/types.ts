import { SOFT_BADGE } from "../../components/ui/softBadge";

export type ProposalStatus = "pending" | "approved" | "rejected";

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "결재 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const PROPOSAL_STATUS_STYLES: Record<ProposalStatus, string> = {
  pending: SOFT_BADGE.blue,
  approved: SOFT_BADGE.green,
  rejected: SOFT_BADGE.red,
};

export type ProposalStepStatus = "pending" | "approved" | "rejected";

export type ProposalApproverTitle = "dept_head" | "team_lead" | "ceo";

export const PROPOSAL_TITLE_LABELS: Record<ProposalApproverTitle, string> = {
  dept_head: "부서장",
  team_lead: "팀장",
  ceo: "대표",
};

export type ProposalAttachmentKind = "file" | "link";

export interface ProposalAttachment {
  id: number;
  kind: ProposalAttachmentKind;
  label: string;
  url: string | null;
  created_by: number;
  created_at: string;
}

export interface ProposalStep {
  step_order: number;
  title: ProposalApproverTitle;
  approver_id: number;
  approver_name: string;
  status: ProposalStepStatus;
  decided_at: string | null;
}

export interface Proposal {
  id: number;
  doc_no: string;
  kind: string | null;
  title: string;
  topic: string;
  content: string;
  department_name: string;
  issue_date: string;
  status: ProposalStatus;
  current_step: number;
  is_final_decision: boolean;
  created_by: number;
  creator_name: string;
  steps: ProposalStep[];
  attachments: ProposalAttachment[];
  has_pdf: boolean;
  reject_reason: string | null;
  delete_requested: boolean; // 승인된 품의서의 삭제 결재가 진행 중
  order_sent_at: string | null; // 구매 품의서: 발주서 발송 확인 시각
  received_at: string | null; // 구매 품의서: 입고 확인 시각
  created_at: string;
}
