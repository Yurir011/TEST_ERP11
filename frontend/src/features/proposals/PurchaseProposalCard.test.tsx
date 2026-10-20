// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../projectDocuments/types";
import { PurchaseProposalCard } from "./PurchaseProposalCard";
import type { Proposal } from "./types";

afterEach(cleanup);

const proposal = (over: Partial<Proposal> = {}): Proposal =>
  ({
    id: 1, kind: "구매", title: "PCB 기판 구매", doc_no: "BS-품의-RND-261018-01", issue_date: "2026-10-18", status: "approved",
    steps: [], is_final_decision: false, delete_requested: false, reject_reason: null, order_sent_at: null, received_at: null,
    attachments: [], has_pdf: true, ...over,
  }) as unknown as Proposal;

const order = (over: Partial<ProjectDocument> = {}): ProjectDocument =>
  ({ id: 10, proposal_id: 1, doc_type: "purchase_order", status: "approved", client_name: "한솔전자", currency: "KRW",
    items: [{ content: "PCB", quantity: 10, unit_price: 58438 }], ...over }) as unknown as ProjectDocument;

function renderCard(p: Proposal, orders: ProjectDocument[] = [], extra: Partial<Parameters<typeof PurchaseProposalCard>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(), onOrder: vi.fn(), onOpenOrder: vi.fn(), onToggleSent: vi.fn(), onToggleReceived: vi.fn(),
    onAttach: vi.fn(), onDownload: vi.fn(), onPrint: vi.fn(),
  };
  render(<PurchaseProposalCard proposal={p} orders={orders} canManage busy={false} {...handlers} {...extra} />);
  return handlers;
}

describe("구매 품의서 카드", () => {
  it("결재 대기 중에는 발주 버튼을 누를 수 없다", () => {
    renderCard(proposal({ status: "pending" }));
    expect((screen.getByRole("button", { name: "발주" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("발주 대기")).toBeTruthy();
  });

  it("승인되면 발주 버튼으로 발주서 작성을 시작하고, 미발주로 표시된다", () => {
    const h = renderCard(proposal());
    expect(screen.getByText("미발주")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "발주" }));
    expect(h.onOrder).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "입고" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("발주서가 승인되면 발주 완료와 발송 확인 버튼이 나오고, 거래처·합계가 채워진다", () => {
    const h = renderCard(proposal(), [order()]);
    expect(screen.getByText("발주 완료")).toBeTruthy();
    expect(screen.getByText("한솔전자")).toBeTruthy();
    expect(screen.getByText("₩584,380")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "발송 확인" }));
    expect(h.onToggleSent).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "발주" }));
    expect(h.onOpenOrder).toHaveBeenCalledTimes(1);
  });

  it("발송 확인 후에는 입고 버튼이 켜지고 누르면 입고 완료 처리를 요청한다", () => {
    const h = renderCard(proposal({ order_sent_at: "2026-10-22T01:00:00Z" }), [order()]);
    const receive = screen.getByRole("button", { name: "입고" }) as HTMLButtonElement;
    expect(receive.disabled).toBe(false);
    expect(screen.getByText("입고 대기")).toBeTruthy();
    fireEvent.click(receive);
    expect(h.onToggleReceived).toHaveBeenCalledWith(true);
  });

  it("작성자나 관리자가 아니면 발송·입고 확인을 할 수 없다", () => {
    renderCard(proposal({ order_sent_at: "2026-10-22T01:00:00Z" }), [order()], { canManage: false });
    expect((screen.getByRole("button", { name: "입고" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("첨부 버튼과 카드 본문은 각각 상세를 연다", () => {
    const h = renderCard(proposal());
    fireEvent.click(screen.getByRole("button", { name: "첨부" }));
    expect(h.onAttach).toHaveBeenCalledTimes(1);
    expect(h.onOpen).not.toHaveBeenCalled(); // 흐름 영역 클릭은 카드 전체 클릭으로 번지지 않는다
    fireEvent.click(screen.getByText("PCB 기판 구매"));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it("결재가 2단계이면 결재대기 배지가 2개 보인다", () => {
    renderCard(
      proposal({
        status: "pending",
        steps: [
          { step_order: 1, title: "dept_head", approver_id: 1, approver_name: "부서장", status: "pending", decided_at: null },
          { step_order: 2, title: "ceo", approver_id: 2, approver_name: "대표", status: "pending", decided_at: null },
        ],
      }),
    );
    expect(screen.getAllByText("결재대기")).toHaveLength(2);
  });
});
