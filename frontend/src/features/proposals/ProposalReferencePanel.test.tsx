// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalReferencePanel } from "./ProposalReferencePanel";
import type { Proposal } from "./types";

const api = vi.hoisted(() => ({ downloadFile: vi.fn(), openFile: vi.fn() }));
vi.mock("../../lib/api", () => ({
  ...api,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.openFile.mockResolvedValue(undefined);
  api.downloadFile.mockResolvedValue(undefined);
});
afterEach(cleanup);

const proposal = (over: Partial<Proposal> = {}): Proposal =>
  ({
    id: 7, kind: "구매", title: "모니터", doc_no: "BS-품의-RND-261002-01", issue_date: "2026-10-02", status: "approved",
    topic: "모니터 구매", content: "품목 : LG 27인치 모니터\n수량 : 3\n단가 : 301,000원", department_name: "연구개발팀", creator_name: "관리자",
    is_final_decision: false, has_pdf: true,
    steps: [
      { step_order: 1, title: "team_lead", approver_id: 1, approver_name: "정혜란", status: "approved", decided_at: null },
      { step_order: 2, title: "ceo", approver_id: 2, approver_name: "박소장", status: "approved", decided_at: null },
    ],
    attachments: [
      { id: 1, kind: "file", label: "견적서.pdf", url: null, created_by: 1, created_at: "x" },
      { id: 2, kind: "file", label: "단가표.xlsx", url: null, created_by: 1, created_at: "x" },
      { id: 3, kind: "link", label: "거래처 페이지", url: "https://example.com/q", created_by: 1, created_at: "x" },
    ],
    ...over,
  }) as unknown as Proposal;

describe("참조 품의서 패널", () => {
  it("품의서의 번호·기안일·내용(줄바꿈 유지)·결재 현황을 보여 준다", () => {
    render(<ProposalReferencePanel proposal={proposal()} onClose={vi.fn()} />);
    const panel = screen.getByRole("complementary", { name: "참조 품의서" });
    expect(panel.textContent).toContain("BS-품의-RND-261002-01");
    expect(panel.textContent).toContain("2026-10-02");
    expect(panel.textContent).toContain("아래와 같이 모니터 구매를 진행하고자 합니다.");
    expect(panel.textContent).toContain("품목 : LG 27인치 모니터");
    expect(panel.textContent).toContain("정혜란");
    expect(panel.textContent).toContain("박소장");
  });

  it("전결 품의서는 결재 현황에 전결로 나온다", () => {
    render(<ProposalReferencePanel proposal={proposal({ steps: [], is_final_decision: true })} onClose={vi.fn()} />);
    expect(screen.getByText("전결")).toBeTruthy();
  });

  it("PDF 열기는 새 창으로 열고, PDF 가 없으면 꺼져 있다", () => {
    render(<ProposalReferencePanel proposal={proposal()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /품의서 PDF 열기/ }));
    expect(api.openFile).toHaveBeenCalledWith("/api/proposals/7/pdf");
    cleanup();
    render(<ProposalReferencePanel proposal={proposal({ has_pdf: false })} onClose={vi.fn()} />);
    expect((screen.getByRole("button", { name: /품의서 PDF 열기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("첨부는 이름을 누르면 PDF 는 새 창, 엑셀은 내려받기, 링크는 새 창으로 연다", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ProposalReferencePanel proposal={proposal()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "견적서.pdf 열기" }));
    expect(api.openFile).toHaveBeenCalledWith("/api/proposals/7/attachments/1/file");
    fireEvent.click(screen.getByRole("button", { name: "단가표.xlsx 열기" }));
    expect(api.downloadFile).toHaveBeenCalledWith("/api/proposals/7/attachments/2/file", "단가표.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "거래처 페이지 열기" }));
    expect(open).toHaveBeenCalledWith("https://example.com/q", "_blank");
    open.mockRestore();
  });

  it("열지 못하면 이유를 알린다", async () => {
    api.openFile.mockRejectedValue(new Error("x"));
    render(<ProposalReferencePanel proposal={proposal()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /품의서 PDF 열기/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("품의서 PDF를 열지 못했습니다."));
  });

  it("닫기 버튼·X·Esc 로 닫는다", () => {
    const onClose = vi.fn();
    render(<ProposalReferencePanel proposal={proposal()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "참조 닫기" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
