export type ProposalStatus = "pending" | "approved" | "rejected";

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "결재 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const PROPOSAL_STATUS_STYLES: Record<ProposalStatus, string> = {
  pending: "bg-tile-blue text-tile-blue-fg",
  approved: "bg-tile-green text-tile-green-fg",
  rejected: "bg-red-50 text-danger",
};

export type ProposalStepStatus = "pending" | "approved" | "rejected";

export type ProposalApproverTitle = "dept_head" | "team_lead" | "ceo";

export const PROPOSAL_TITLE_LABELS: Record<ProposalApproverTitle, string> = {
  dept_head: "부서장",
  team_lead: "팀장",
  ceo: "대표",
};

// 결재 시작 단계를 고르면 나머지 결재선이 자동으로 정해진다 (마지막 단계는 항상 대표). 백엔드 STEP_CHAINS와 동일하게 유지할 것.
export const PROPOSAL_STEP_CHAINS: Record<ProposalApproverTitle, ProposalApproverTitle[]> = {
  dept_head: ["dept_head", "team_lead", "ceo"],
  team_lead: ["team_lead", "ceo"],
  ceo: ["ceo"],
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
  created_by: number;
  creator_name: string;
  steps: ProposalStep[];
  attachments: ProposalAttachment[];
  has_pdf: boolean;
  reject_reason: string | null;
  created_at: string;
}
