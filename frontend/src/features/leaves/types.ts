import type { ApprovalStep } from "../../components/approval/types";

export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRecord {
  id: number;
  user_id: number;
  user_name: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  current_step: number;
  steps: ApprovalStep[];
  approver_id: number | null;
  approver_name: string | null;
  is_final_decision: boolean;
  reject_reason: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface LeaveBalance {
  granted: number;
  used: number;
  pending: number;
  remaining: number;
  period_start: string;
  period_end: string;
}
