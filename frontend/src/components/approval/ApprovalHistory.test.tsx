// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalHistory } from "./ApprovalHistory";

afterEach(cleanup);

describe("결재 히스토리 카드", () => {
  it("세 칸(작성 · 결재/승인 · 현재 진행)에 날짜·처리자·내용이 나온다", () => {
    render(
      <ApprovalHistory
        creatorName="김영업"
        createdAt="2026-10-16T11:00:00"
        summary="명세서 · 합계 3,960,000원"
        steps={[
          { step_order: 1, title: "dept_head", approver_name: "박부장", status: "approved", decided_at: "2026-10-16T11:30:00" },
          { step_order: 2, title: "team_lead", approver_name: "이팀장", status: "rejected", decided_at: "2026-10-16T13:15:00" },
        ]}
        currentStep={2}
        status="rejected"
        finalDecision={false}
        rejectReason="수량이 발주서와 다릅니다."
        deleteRequested={false}
      />,
    );
    const region = screen.getByRole("region", { name: "결재 히스토리" });
    expect(within(region).getByText("작성")).toBeTruthy();
    expect(within(region).getByText("김영업")).toBeTruthy();
    expect(within(region).getByText("명세서 · 합계 3,960,000원")).toBeTruthy();
    expect(within(region).getByText("1/2")).toBeTruthy();
    expect(within(region).getByText("박부장")).toBeTruthy();
    expect(within(region).getByText("반려됨")).toBeTruthy();
    expect(within(region).getByText("수량이 발주서와 다릅니다.")).toBeTruthy();
    expect(within(region).getByText("이팀장 팀장")).toBeTruthy();
  });

  it("결재선이 없고 전결도 아니면 안내한다", () => {
    render(<ApprovalHistory creatorName="김영업" createdAt="2026-10-16T11:00:00" summary="x" steps={[]} currentStep={0} status="draft" finalDecision={false} rejectReason={null} deleteRequested={false} />);
    expect(screen.getByText("결재선이 없습니다.")).toBeTruthy();
    expect(screen.getByText("작성 중")).toBeTruthy();
  });
});
