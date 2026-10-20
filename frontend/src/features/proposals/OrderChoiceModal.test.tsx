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
  const h = { onCreateOrder: vi.fn(), onOnlineDone: vi.fn(), onChangePayment: vi.fn(), onCancelOrder: vi.fn(), onOpenOrder: vi.fn(), onClose: vi.fn() };
  render(<OrderChoiceModal proposal={proposal} orders={[]} onlineOrdered={false} orderDone={false} canManage busy={false} {...h} {...over} />);
  return h;
}

describe("발주 방법 선택 팝업", () => {
  it("발주서 작성과 발주 완료 두 가지를 고를 수 있다", () => {
    const h = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /발주서 작성/ }));
    expect(h.onCreateOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/온라인 주문처럼 발주서 없이/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^발주 완료/ }));
    expect(h.onOnlineDone).not.toHaveBeenCalled(); // 결제 방법을 확인한 뒤에 처리한다
    fireEvent.click(screen.getByRole("button", { name: /이 내용으로 처리/ }));
    expect(h.onOnlineDone).toHaveBeenCalledWith({ payment_method: null, payment_card: null });
  });

  it("발주 완료에서 입금이나 법인카드를 고르지 않으면 미입금으로 처리한다", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^발주 완료/ }));
    expect(screen.getByText(/미입금으로 처리됩니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /이 내용으로 처리 \(미입금\)/ })).toBeTruthy();
  });

  it("입금을 고르면 입금, 법인카드를 고르면 카드 종류와 함께 보내고 둘은 함께 고를 수 없다", () => {
    const h = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^발주 완료/ }));
    fireEvent.click(screen.getByLabelText("입금"));
    fireEvent.click(screen.getByRole("button", { name: /이 내용으로 처리 \(입금\)/ }));
    expect(h.onOnlineDone).toHaveBeenLastCalledWith({ payment_method: "deposit", payment_card: null });

    fireEvent.change(screen.getByLabelText("법인카드"), { target: { value: "bc" } });
    expect((screen.getByLabelText("입금") as HTMLInputElement).checked).toBe(false); // 카드를 고르면 입금은 해제된다
    fireEvent.click(screen.getByRole("button", { name: /이 내용으로 처리 \(법인카드/ }));
    expect(h.onOnlineDone).toHaveBeenLastCalledWith({ payment_method: "card", payment_card: "bc" });
  });

  it("발주 완료된 건은 현재 결제 상태를 보여 주고 바꿀 수 있다", () => {
    const done = { ...proposal, order_sent_at: "2026-10-21T01:00:00Z", payment_method: "deposit", payment_card: null } as unknown as Proposal;
    const h = renderModal({ proposal: done, onlineOrdered: true, orderDone: true });
    expect(screen.getByText("입금", { selector: "b" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("법인카드"), { target: { value: "kb_kookmin" } });
    fireEvent.click(screen.getByRole("button", { name: "결제 상태 저장" }));
    expect(h.onChangePayment).toHaveBeenCalledWith({ payment_method: "card", payment_card: "kb_kookmin" });
  });

  it("이미 발주서가 있으면 발주 완료(발주서 없이)는 고를 수 없고 작성한 발주서를 열 수 있다", () => {
    const h = renderModal({ orders: [order] });
    expect((screen.getByRole("button", { name: /^발주 완료/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("이미 발주서가 작성되어 있습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /한솔전자/ }));
    expect(h.onOpenOrder).toHaveBeenCalledWith(order);
  });

  it("발주가 완료되면 발주서 작성은 꺼지고 발주서 보기가 나온다", () => {
    const h = renderModal({ orders: [order], orderDone: true });
    const create = screen.getByRole("button", { name: /^발주서 작성/ }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/이미 발주 완료되어 발주서를 새로 작성할 수 없습니다/)).toBeTruthy();
    fireEvent.click(create);
    expect(h.onCreateOrder).not.toHaveBeenCalled();
    expect(screen.getByText("발주서 보기")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /한솔전자/ }));
    expect(h.onOpenOrder).toHaveBeenCalledWith(order);
  });

  it("온라인 주문으로 발주 완료된 경우에도 발주서 작성은 꺼지고 발주서가 없다고 안내한다", () => {
    renderModal({ orders: [], onlineOrdered: true, orderDone: true });
    expect((screen.getByRole("button", { name: /^발주서 작성/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/발주서 없음 \(온라인 주문으로 발주 완료 처리됨\)/)).toBeTruthy();
  });

  it("발주서가 결재 중이라 아직 발주 완료 전이면 발주서 작성은 켜져 있다", () => {
    const h = renderModal({ orders: [{ ...order, status: "pending" } as unknown as ProjectDocument], orderDone: false });
    fireEvent.click(screen.getByRole("button", { name: /^발주서 작성/ }));
    expect(h.onCreateOrder).toHaveBeenCalledTimes(1);
  });

  it("이미 발주 완료로 처리했거나 권한이 없으면 발주 완료를 고를 수 없다", () => {
    renderModal({ onlineOrdered: true });
    expect((screen.getByRole("button", { name: /^발주 완료/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderModal({ canManage: false });
    expect((screen.getByRole("button", { name: /^발주 완료/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("발주 완료된 건에는 발주 취소 버튼이 있고 누르면 취소를 요청한다", () => {
    const done = { ...proposal, order_sent_at: "2026-10-21T01:00:00Z" } as unknown as Proposal;
    const h = renderModal({ proposal: done, onlineOrdered: true, orderDone: true });
    fireEvent.click(screen.getByRole("button", { name: "발주 취소" }));
    expect(h.onCancelOrder).toHaveBeenCalledTimes(1);
  });

  it("발주 전에는 발주 취소 버튼이 없고, 입고 완료된 건이나 권한이 없으면 누를 수 없다", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "발주 취소" })).toBeNull();
    cleanup();
    const received = { ...proposal, order_sent_at: "x", received_at: "y" } as unknown as Proposal;
    renderModal({ proposal: received, orderDone: true });
    expect((screen.getByRole("button", { name: "발주 취소" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const sent = { ...proposal, order_sent_at: "x" } as unknown as Proposal;
    renderModal({ proposal: sent, orderDone: true, canManage: false });
    expect((screen.getByRole("button", { name: "발주 취소" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Esc 와 닫기 버튼으로 닫는다", () => {
    const h = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });
});
