// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../projectDocuments/types";
import { OrderChoiceModal } from "./OrderChoiceModal";
import type { Proposal } from "./types";

afterEach(cleanup);

const proposal = { id: 1, title: "샘플 구매" } as unknown as Proposal;
const order = { id: 10, issue_date: "2026-10-20", client_name: "한솔전자", status: "approved" } as unknown as ProjectDocument;

function renderModal(over: Partial<Parameters<typeof OrderChoiceModal>[0]> = {}) {
  const h = { onCreateOrder: vi.fn(), onOnlineDone: vi.fn(), onOpenOrder: vi.fn(), onClose: vi.fn() };
  render(<OrderChoiceModal proposal={proposal} orders={[]} onlineOrdered={false} canManage busy={false} {...h} {...over} />);
  return h;
}

describe("발주 방법 선택 팝업", () => {
  it("발주서 작성과 발주 완료 두 가지를 고를 수 있다", () => {
    const h = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /발주서 작성/ }));
    expect(h.onCreateOrder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^발주 완료/ }));
    expect(h.onOnlineDone).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/온라인 주문처럼 발주서 없이/)).toBeTruthy();
  });

  it("이미 발주서가 있으면 발주 완료(발주서 없이)는 고를 수 없고 작성한 발주서를 열 수 있다", () => {
    const h = renderModal({ orders: [order] });
    expect((screen.getByRole("button", { name: /^발주 완료/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("이미 발주서가 작성되어 있습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /한솔전자/ }));
    expect(h.onOpenOrder).toHaveBeenCalledWith(order);
  });

  it("이미 발주 완료로 처리했거나 권한이 없으면 발주 완료를 고를 수 없다", () => {
    renderModal({ onlineOrdered: true });
    expect((screen.getByRole("button", { name: /^발주 완료/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderModal({ canManage: false });
    expect((screen.getByRole("button", { name: /^발주 완료/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Esc 와 닫기 버튼으로 닫는다", () => {
    const h = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });
});
