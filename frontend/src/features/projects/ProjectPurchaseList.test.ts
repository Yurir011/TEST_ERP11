import { describe, expect, it } from "vitest";
import { computePurchaseFlow } from "../proposals/purchaseFlow";
import type { Proposal } from "../proposals/types";
import { purchaseStatusChips, purchaseSteps } from "./ProjectPurchaseList";

const proposal = (over: Partial<Proposal> = {}): Proposal =>
  ({ id: 1, kind: "구매", status: "approved", delete_requested: false, steps: [], attachments: [], is_final_decision: true, order_sent_at: null, received_at: null, payment_method: null, ...over }) as unknown as Proposal;

const view = (p: Proposal) => {
  const flow = computePurchaseFlow(p, []);
  return { steps: purchaseSteps(p, flow).map((s) => s.state), chips: purchaseStatusChips(p, flow).map((c) => c.label) };
};

describe("프로젝트 구매 줄의 진행 상태", () => {
  it("결재 중이면 품의가 진행 중이고 발주·입고는 대기이다", () => {
    expect(view(proposal({ status: "pending" }))).toEqual({ steps: ["now", "idle", "idle"], chips: ["결재 중"] });
  });

  it("승인됐지만 발주 전이면 미발주이다", () => {
    expect(view(proposal())).toEqual({ steps: ["done", "now", "idle"], chips: ["미발주"] });
  });

  it("반려되면 품의에 반려 표시가 나온다", () => {
    expect(view(proposal({ status: "rejected" })).steps[0]).toBe("fail");
    expect(view(proposal({ status: "rejected" })).chips).toEqual(["반려됨"]);
  });

  it("발주 완료 후 입고 전에는 입고 대기이고, 결제하지 않았으면 외상도 보인다", () => {
    expect(view(proposal({ order_sent_at: "2026-10-12T01:00:00Z" }))).toEqual({ steps: ["done", "done", "now"], chips: ["입고 대기", "외상"] });
    expect(view(proposal({ order_sent_at: "2026-10-12T01:00:00Z", payment_method: "card", payment_card: "bc" })).chips).toEqual(["입고 대기"]);
  });

  it("입고가 끝나면 서류 등록 여부가 보인다", () => {
    const done = proposal({ order_sent_at: "x", received_at: "y" });
    expect(view(done)).toEqual({ steps: ["done", "done", "done"], chips: ["서류 미등록"] });
    const withDocs = proposal({
      order_sent_at: "x",
      received_at: "y",
      attachments: [
        { id: 1, kind: "file", label: "a.pdf", url: null, doc_kind: "statement", created_by: 1, created_at: "x" },
        { id: 2, kind: "file", label: "b.pdf", url: null, doc_kind: "tax_invoice", created_by: 1, created_at: "x" },
      ],
    });
    expect(view(withDocs).chips).toEqual(["서류 등록 완료"]);
  });
});
