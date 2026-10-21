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
  granted: number; // 이번 주기 발생 연차 (자동 발생 + 관리자 조정)
  auto_granted: number; // 입사일 기준 근로기준법 자동 발생분
  adjustment: number; // 관리자 조정 (+/-)
  carried_deficit: number; // 지난 주기에 당겨 써서 먼저 차감되는 일수
  used: number;
  pending: number;
  remaining: number; // 마이너스면 연차를 미리 당겨 쓴 것
  advance_limit: number; // 당겨 쓸 수 있는 최대 일수
  hire_date: string | null;
  period_start: string;
  period_end: string;
}

/** 관리자용 직원별 연차 현황 한 줄 */
export interface LeaveBalanceRow extends LeaveBalance {
  user_id: number;
  user_name: string;
}

export interface LeaveAdjustment {
  id: number;
  user_id: number;
  days: number;
  reason: string;
  effective_date: string;
  created_by_name: string | null;
  created_at: string;
}
