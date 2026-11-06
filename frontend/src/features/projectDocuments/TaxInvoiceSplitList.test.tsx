// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaxInvoiceSplitList } from "./TaxInvoiceSplitList";
import type { ProjectDocument } from "./types";

afterEach(cleanup);

function doc(over: Partial<ProjectDocument>): ProjectDocument {
  return {
    id: 1,
    doc_type: "tax_invoice",
    issue_date: "2026-11-05",
    currency: "KRW",
    client_name: "대성RF",
    status: "approved",
    direction: "purchase",
    is_paper: false,
    items: [{ id: 1, content: "RF 커넥터", quantity: 1, unit_price: 1000000, note: null }],
    created_by: 7,
    ...over,
  } as ProjectDocument;
}

describe("TaxInvoiceSplitList", () => {
  it("매입은 왼쪽, 매출은 오른쪽 표로 나누고 부가세를 더한 합계를 보여준다", () => {
    const docs = [
      doc({ id: 1 }),
      doc({ id: 2, client_name: "(주)케이텍", direction: "sales", items: [{ id: 2, content: "무선 모듈", quantity: 2, unit_price: 4000000, note: null }] }),
    ];
    render(<TaxInvoiceSplitList docs={docs} userId={7} onOpenDoc={vi.fn()} onResubmit={vi.fn()} onDelete={vi.fn()} />);
    const buy = within(screen.getByTestId("tax-pane-purchase"));
    const sell = within(screen.getByTestId("tax-pane-sales"));
    expect(buy.getByText("대성RF")).toBeTruthy();
    expect(buy.getAllByText("1,100,000").length).toBeGreaterThan(0); // 공급가액 1,000,000 + 부가세 100,000
    expect(sell.getByText("(주)케이텍")).toBeTruthy();
    expect(sell.getByText("8,800,000")).toBeTruthy();
    expect(buy.queryByText("(주)케이텍")).toBeNull();
  });

  it("승인 전인 건만 상태를 붙이고, 내가 쓴 작성 중 건에는 재요청 버튼이 나온다", () => {
    render(<TaxInvoiceSplitList docs={[doc({ id: 3, status: "draft" })]} userId={7} onOpenDoc={vi.fn()} onResubmit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("초안")).toBeTruthy();
    expect(screen.getByText("재요청")).toBeTruthy();
  });
});
