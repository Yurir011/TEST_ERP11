// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPaymentAccountsForTest } from "../payments/paymentAccounts";
import { TEST_ACCOUNTS } from "../payments/testAccounts";
import { ReceiveModal } from "./ReceiveModal";
import type { Proposal } from "./types";

beforeEach(() => resetPaymentAccountsForTest(TEST_ACCOUNTS));
afterEach(cleanup);

const proposal = { id: 1, title: "소모품 구입" } as unknown as Proposal;

function renderModal(over: Partial<Proposal> = {}) {
  const h = { onConfirm: vi.fn(), onClose: vi.fn() };
  render(<ReceiveModal proposal={{ ...proposal, ...over } as Proposal} busy={false} {...h} />);
  return h;
}

describe("입고 완료 · 대금 결제 확인", () => {
  it("아무것도 고르지 않으면 외상으로 입고 완료 처리한다", () => {
    const h = renderModal();
    expect(screen.getByText(/아무것도 선택하지 않으면/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /입고 완료 \(외상\)/ }));
    expect(h.onConfirm).toHaveBeenCalledWith({ payment_method: null, payment_card: null, payment_bank: null });
  });

  it("입금을 고르면 계좌를 함께 보낸다", () => {
    const h = renderModal();
    fireEvent.click(screen.getByLabelText("입금"));
    fireEvent.change(screen.getByLabelText("입금 계좌"), { target: { value: "woori" } });
    fireEvent.click(screen.getByRole("button", { name: /입고 완료 \(입금 \(우리은행\)\)/ }));
    expect(h.onConfirm).toHaveBeenCalledWith({ payment_method: "deposit", payment_card: null, payment_bank: "woori" });
  });

  it("발주 때 이미 결제한 건은 그 결제 상태가 미리 골라져 있다", () => {
    const h = renderModal({ payment_method: "card", payment_card: "bc" } as Partial<Proposal>);
    expect((screen.getByLabelText("법인카드") as HTMLSelectElement).value).toBe("bc");
    fireEvent.click(screen.getByRole("button", { name: /입고 완료 \(법인카드 \(BC카드\)\)/ }));
    expect(h.onConfirm).toHaveBeenCalledWith({ payment_method: "card", payment_card: "bc", payment_bank: null });
  });

  it("취소와 Esc 로 닫는다", () => {
    const h = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(h.onClose).toHaveBeenCalledTimes(2);
    expect(h.onConfirm).not.toHaveBeenCalled();
  });
});
