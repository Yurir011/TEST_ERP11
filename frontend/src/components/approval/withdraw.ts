import type { ApprovalStepStatus } from "./types";

/**
 * 결재 요청을 회수할 수 있는지: 결재 대기 중이고, 작성자 본인이며, 다른 결재자가 아직 아무도 승인하지 않았을 때.
 * 기안자 본인이 결재권자로 지정되어 자동 승인된 단계(자기결재)는 승인으로 보지 않는다. 서버도 같은 규칙으로 막는다.
 */
export function canWithdrawApproval(input: {
  status: string;
  creatorId: number | null | undefined;
  userId: number | null | undefined;
  steps: { approver_id: number; status: ApprovalStepStatus }[];
}): boolean {
  if (input.status !== "pending" || input.userId == null || input.creatorId !== input.userId) return false;
  return !input.steps.some((s) => s.status === "approved" && s.approver_id !== input.userId);
}

export const WITHDRAW_CONFIRM_MESSAGE = "결재 요청을 회수할까요?\n회수하면 결재선이 초기화되고, 수정해서 다시 올리거나 폐기할 수 있습니다.";
