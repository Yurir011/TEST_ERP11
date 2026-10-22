// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalNote, ApprovalStampBox } from "./ApprovalStamps";
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

describe("결재칸 표", () => {
  it("결재자마다 한 칸이 있고 처리 결과와 이름·날짜가 적히며, 맨 아래 합친 줄에 상태가 나온다 (작성자 칸은 없다)", () => {
    render(<ApprovalStampBox {...base} />);
    const table = screen.getByRole("table", { name: "결재 현황" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["부서장", "팀장"]);
    const cells = within(table).getAllByRole("cell");
    expect(cells).toHaveLength(3); // 결재자 두 칸 + 상태 한 줄
    expect(cells[0].textContent).toContain("승인");
    expect(cells[0].textContent).toContain("박부장");
    expect(cells[0].textContent).toContain("10-16");
    expect(cells[1].textContent).toContain("결재 중"); // 지금 차례
    expect(cells[1].textContent).toContain("이팀장");
    expect(cells[2].textContent).toBe("결재 대기");
    expect(cells[2].getAttribute("colspan")).toBe("2");
    expect(table.textContent).not.toContain("김영업"); // 작성자는 항목 표에 있다
  });

  it("결재자가 없는 전결 문서는 [결재(전결)] 한 칸과 상태 줄이다", () => {
    render(<ApprovalStampBox {...base} steps={[]} status="approved" finalDecision decidedAt="2026-10-16T12:00:00" />);
    const table = screen.getByRole("table", { name: "결재 현황" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["결재"]);
    const cells = within(table).getAllByRole("cell");
    expect(cells[0].textContent).toContain("승인");
    expect(cells[0].textContent).toContain("전결");
    expect(cells[0].textContent).toContain("10-16"); // 전결일
    expect(cells[1].textContent).toBe("승인됨");
  });

  it("결재선이 아직 없는 작성 중 문서도 빈 칸 하나와 상태 줄을 보인다", () => {
    render(<ApprovalStampBox {...base} steps={[]} status="draft" currentStep={0} />);
    const cells = within(screen.getByRole("table", { name: "결재 현황" })).getAllByRole("cell");
    expect(cells[1].textContent).toBe("작성 중");
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
