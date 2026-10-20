import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "../projectDocuments/types";
import { computePurchaseFlow, isPurchaseProposal, summarizeOrders } from "./purchaseFlow";
import type { Proposal, ProposalStep } from "./types";

const proposal = (over: Partial<Proposal> = {}): Proposal =>
  ({
    id: 1, kind: "구매", status: "pending", steps: [], is_final_decision: false, delete_requested: false, reject_reason: null,
    order_sent_at: null, received_at: null, ...over,
  }) as unknown as Proposal;

const order = (over: Partial<ProjectDocument> = {}): ProjectDocument =>
  ({ id: 10, proposal_id: 1, doc_type: "purchase_order", status: "approved", client_name: "한솔전자", currency: "KRW",
    items: [{ content: "PCB", quantity: 10, unit_price: 1000 }], ...over }) as unknown as ProjectDocument;

const steps = (...statuses: ("approved" | "pending")[]): ProposalStep[] =>
  statuses.map((status, i) => ({ step_order: i + 1, title: "dept_head", approver_id: i, approver_name: `결재${i + 1}`, status, decided_at: null }));

describe("구매 품의서 진행 상태", () => {
  it("구매 종류만 대상이다", () => {
    expect(isPurchaseProposal(proposal())).toBe(true);
    expect(isPurchaseProposal(proposal({ kind: "출장" }))).toBe(false);
    expect(isPurchaseProposal(proposal({ kind: null }))).toBe(false);
  });

  it("결재가 2단계이면 결재대기가 2개 나오고, 승인된 단계는 승인으로 바뀐다", () => {
    const wait = computePurchaseFlow(proposal({ steps: steps("pending", "pending") }), []);
    expect(wait.approval.map((c) => c.label)).toEqual(["결재대기", "결재대기"]);
    expect(wait.canOrder).toBe(false);
    expect(wait.orderLabel.label).toBe("발주 대기");

    const half = computePurchaseFlow(proposal({ steps: steps("approved", "pending") }), []);
    expect(half.approval.map((c) => c.label)).toEqual(["승인", "결재대기"]);
  });

  it("승인되면 발주 버튼이 켜지고 발주 전에는 미발주(빨강)로 표시된다", () => {
    const f = computePurchaseFlow(proposal({ status: "approved" }), []);
    expect(f.approval[0].label).toBe("승인됨");
    expect(f.canOrder).toBe(true);
    expect(f.orderLabel).toEqual({ label: "미발주", tone: "red" });
    expect(f.canReceive).toBe(false);
  });

  it("발주서가 결재 중이면 발주 결재중, 승인되면 발주 완료이며 발송 확인을 할 수 있다", () => {
    const pending = computePurchaseFlow(proposal({ status: "approved" }), [order({ status: "pending" })]);
    expect(pending.orderLabel.label).toBe("발주서 확인중");
    expect(pending.canConfirmSent).toBe(false);

    const done = computePurchaseFlow(proposal({ status: "approved" }), [order()]);
    expect(done.orderLabel.label).toBe("발주 완료");
    expect(done.canConfirmSent).toBe(true);
    expect(done.canReceive).toBe(false);
  });

  it("반려된 발주서와 다른 품의서의 발주서는 세지 않는다", () => {
    const f = computePurchaseFlow(proposal({ status: "approved" }), [order({ status: "rejected" }), order({ id: 11, proposal_id: 2 })]);
    expect(f.activeOrders).toHaveLength(0);
    expect(f.orderLabel.label).toBe("미발주");
  });

  it("발송 확인 후에 입고 버튼이 켜지고, 입고 확인하면 입고 완료가 된다", () => {
    const sent = computePurchaseFlow(proposal({ status: "approved", order_sent_at: "2026-10-22T00:00:00Z" }), [order()]);
    expect(sent.canReceive).toBe(true);
    expect(sent.canConfirmSent).toBe(false);
    expect(sent.receiveLabel.label).toBe("입고 대기");

    const got = computePurchaseFlow(proposal({ status: "approved", order_sent_at: "x", received_at: "y" }), [order()]);
    expect(got.receiveLabel).toEqual({ label: "입고 완료", tone: "green" });
  });

  it("온라인 주문은 발주서 없이 발주 완료 처리하면 바로 입고를 할 수 있다", () => {
    const f = computePurchaseFlow(proposal({ status: "approved", order_sent_at: "2026-10-22T01:00:00Z" }), []);
    expect(f.onlineOrdered).toBe(true);
    expect(f.orderDone).toBe(true);
    expect(f.orderLabel.label).toBe("발주 완료");
    expect(f.canReceive).toBe(true);
    expect(f.canConfirmSent).toBe(false);
    // 발주서가 있으면 온라인 주문이 아니다
    expect(computePurchaseFlow(proposal({ status: "approved", order_sent_at: "x" }), [order()]).onlineOrdered).toBe(false);
  });

  it("카드 오른쪽 요약은 발주서가 생겨야 나오고, 여러 장이면 합산한다", () => {
    expect(summarizeOrders([])).toBeNull();
    const one = summarizeOrders([order()])!;
    expect(one).toEqual({ client: "한솔전자", content: "PCB", total: "₩10,000" });
    const two = summarizeOrders([order(), order({ id: 12, client_name: "대성RF" })])!;
    expect(two.client).toBe("한솔전자 외 1곳");
    expect(two.total).toBe("₩20,000");
  });
});
