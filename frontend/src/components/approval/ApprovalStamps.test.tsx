// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalNote, ApprovalStamps } from "./ApprovalStamps";
import type { HistoryInput } from "./historyModel";

afterEach(cleanup);

const base: HistoryInput = {
  creatorName: "김영업",
  createdAt: "2026-10-16T11:00:00",
  summary: "명세서",
  steps: [
    { step_order: 1, title: "dept_head", approver_name: "박부장", status: "approved", decided_at: "2026-10-16T11:30:00" },
    { step_order: 2, title: "team_lead", approver_name: "이팀장", status: "pending", decided_at: null },
  ],
  currentStep: 2,
  status: "pending",
  finalDecision: false,
  rejectReason: null,
  deleteRequested: false,
};

describe("결재 도장 줄", () => {
  it("작성과 결재자마다 도장이 하나씩, 이름·직책·날짜가 아래에 붙는다", () => {
    render(<ApprovalStamps {...base} />);
    const items = within(screen.getByRole("list", { name: "결재 현황" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("작성");
    expect(items[0].textContent).toContain("김영업");
    expect(items[0].textContent).toContain("10-16");
    expect(items[1].textContent).toContain("승인");
    expect(items[1].textContent).toContain("박부장");
    expect(items[1].textContent).toContain("부서장");
    expect(items[2].textContent).toContain("결재 중"); // 지금 차례
    expect(items[2].textContent).not.toMatch(/\d\d-\d\d/); // 아직 처리 전이라 날짜가 없다
  });

  it("결재자가 없는 전결 문서는 작성 도장과 전결 승인 도장 둘이다", () => {
    render(<ApprovalStamps {...base} steps={[]} status="approved" finalDecision decidedAt="2026-10-16T12:00:00" />);
    const items = within(screen.getByRole("list", { name: "결재 현황" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1].textContent).toContain("승인");
    expect(items[1].textContent).toContain("전결");
  });
});

describe("결재 안내 한 줄", () => {
  it("결재를 기다리는 중이면 누구 차례인지 알린다", () => {
    render(<ApprovalNote {...base} />);
    expect(screen.getByRole("status").textContent).toContain("이팀장 팀장 결재 중");
  });

  it("반려되면 반려한 사람과 사유를 알린다", () => {
    render(
      <ApprovalNote
        {...base}
        status="rejected"
        steps={[{ step_order: 1, title: "dept_head", approver_name: "박부장", status: "rejected", decided_at: "2026-10-16T11:30:00" }]}
        currentStep={1}
        rejectReason="수량이 다릅니다."
      />,
    );
    const note = screen.getByRole("status").textContent ?? "";
    expect(note).toContain("박부장");
    expect(note).toContain("수량이 다릅니다.");
  });

  it("승인이 끝났거나 삭제 결재 중이면 아무것도 보이지 않는다", () => {
    const { container, rerender } = render(<ApprovalNote {...base} status="approved" />);
    expect(container.textContent).toBe("");
    rerender(<ApprovalNote {...base} deleteRequested />);
    expect(container.textContent).toBe("");
  });
});
