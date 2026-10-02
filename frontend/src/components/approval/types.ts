import type { ApprovalEndTitle } from "./ApprovalChainPicker";

export type ApprovalStepStatus = "pending" | "approved" | "rejected";

export interface ApprovalStep {
  step_order: number;
  title: ApprovalEndTitle;
  approver_id: number;
  approver_name: string;
  status: ApprovalStepStatus;
  decided_at: string | null;
}
