import { describe, expect, it } from "vitest";
import { canWithdrawApproval } from "./withdraw";

const step = (approver_id: number, status: "pending" | "approved" | "rejected") => ({ approver_id, status });

describe("canWithdrawApproval", () => {
  const base = { creatorId: 1, userId: 1 };

  it("결재 대기 중이고 아무도 승인하지 않았으면 작성자가 회수할 수 있다", () => {
    expect(canWithdrawApproval({ ...base, status: "pending", steps: [step(2, "pending"), step(3, "pending")] })).toBe(true);
  });

  it("다른 결재자가 이미 승인했으면 회수할 수 없다", () => {
    expect(canWithdrawApproval({ ...base, status: "pending", steps: [step(2, "approved"), step(3, "pending")] })).toBe(false);
  });

  it("기안자 본인의 자기결재 단계는 승인으로 보지 않는다", () => {
    expect(canWithdrawApproval({ ...base, status: "pending", steps: [step(1, "approved"), step(3, "pending")] })).toBe(true);
  });

  it("작성자가 아니거나 결재 대기 상태가 아니면 회수할 수 없다", () => {
    expect(canWithdrawApproval({ creatorId: 1, userId: 2, status: "pending", steps: [step(3, "pending")] })).toBe(false);
    expect(canWithdrawApproval({ ...base, status: "approved", steps: [step(3, "approved")] })).toBe(false);
    expect(canWithdrawApproval({ ...base, status: "withdrawn", steps: [] })).toBe(false);
    expect(canWithdrawApproval({ creatorId: 1, userId: undefined, status: "pending", steps: [] })).toBe(false);
  });
});
