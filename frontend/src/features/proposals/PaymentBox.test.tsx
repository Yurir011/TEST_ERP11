// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPaymentAccountsForTest } from "../payments/paymentAccounts";
import { TEST_ACCOUNTS } from "../payments/testAccounts";
import type { Proposal } from "./types";

const { apiPost, apiDelete, confirm } = vi.hoisted(() => ({ apiPost: vi.fn(), apiDelete: vi.fn(), confirm: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiPost, apiDelete }));
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm, notify: vi.fn() }) }));

import { PaymentBox } from "./PaymentBox";

beforeEach(() => resetPaymentAccountsForTest(TEST_ACCOUNTS));
afterEach(() => {
  cleanup();
  apiPost.mockReset();
  apiDelete.mockReset();
});

const pay = (id: number, amount: number) => ({ id, payment_date: "2026-10-22", method: "deposit", account: "ibk", amount });
const proposal = (payments: ReturnType<typeof pay>[], total: number | null = 1100000) => ({ id: 7, payable_total: total, payments }) as unknown as Proposal;

describe("결제 내역 박스", () => {
  it("결제가 없으면 미결제(외상)이고 금액 칸에 잔액 전부가 채워져 있다", () => {
    render(<PaymentBox proposal={proposal([])} canManage onChanged={vi.fn()} />);
    expect(screen.getByText("미결제 (외상)")).toBeTruthy();
    expect((screen.getByLabelText("결제 금액") as HTMLInputElement).value).toBe("1,100,000");
  });

  it("일부만 결제하면 부분 결제이고 잔액이 보인다", () => {
    render(<PaymentBox proposal={proposal([pay(1, 400000)])} canManage onChanged={vi.fn()} />);
    expect(screen.getByText("부분 결제")).toBeTruthy();
    expect(screen.getByText("₩700,000")).toBeTruthy();
    expect((screen.getByLabelText("결제 금액") as HTMLInputElement).value).toBe("700,000");
  });

  it("다 채우면 결제 완료이고 입력 칸이 없다", () => {
    render(<PaymentBox proposal={proposal([pay(1, 400000), pay(2, 700000)])} canManage onChanged={vi.fn()} />);
    expect(screen.getByText("결제 완료")).toBeTruthy();
    expect(screen.queryByLabelText("결제 금액")).toBeNull();
    // 완납 뒤에는 마지막 결제만 지울 수 있다
    expect(screen.queryAllByRole("button", { name: /삭제$/ })).toHaveLength(1);
  });

  it("결제 추가를 누르면 서버에 보내고 돌려받은 품의서로 바꾼다", async () => {
    const updated = proposal([pay(1, 1100000)]);
    apiPost.mockResolvedValue(updated);
    const onChanged = vi.fn();
    render(<PaymentBox proposal={proposal([])} canManage onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "결제 추가" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
    expect(apiPost).toHaveBeenCalledWith("/api/proposals/7/payments", { payment_method: "deposit", account: "ibk", amount: 1100000 });
  });

  it("잔액보다 큰 금액은 서버에 보내지 않고 안내한다", () => {
    render(<PaymentBox proposal={proposal([pay(1, 400000)])} canManage onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("결제 금액"), { target: { value: "700001" } });
    fireEvent.click(screen.getByRole("button", { name: "결제 추가" }));
    expect(screen.getByRole("alert").textContent).toContain("잔액");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("줄의 삭제를 누르면 확인 뒤 서버에서 지운다", async () => {
    const updated = proposal([]);
    apiDelete.mockResolvedValue(updated);
    const onChanged = vi.fn();
    render(<PaymentBox proposal={proposal([pay(1, 400000)])} canManage onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: /400,000 삭제/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
    expect(apiDelete).toHaveBeenCalledWith("/api/proposals/7/payments/1");
  });

  it("작성자·관리자가 아니면 읽기 전용이다", () => {
    render(<PaymentBox proposal={proposal([pay(1, 400000)])} canManage={false} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "결제 추가" })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /삭제$/ })).toHaveLength(0);
    expect(screen.getByText(/작성자와 관리자만/)).toBeTruthy();
  });

  it("발주 완료 전(결제할 금액 없음)에는 아무것도 그리지 않는다", () => {
    const { container } = render(<PaymentBox proposal={proposal([], null)} canManage onChanged={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
