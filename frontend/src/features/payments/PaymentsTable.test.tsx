// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPaymentAccountsForTest } from "./paymentAccounts";
import { PaymentsTable } from "./PaymentsTable";
import { TEST_ACCOUNTS } from "./testAccounts";
import type { Payment } from "./types";

vi.mock("../../lib/api", () => ({ openFile: vi.fn(), apiGet: vi.fn().mockResolvedValue([]) }));

beforeEach(() => resetPaymentAccountsForTest(TEST_ACCOUNTS));
afterEach(cleanup);

const pay = (over: Partial<Payment> = {}): Payment =>
  ({
    id: 1, type: "withdrawal", payment_date: "2026-10-21", category: "소모품비", description: "토너 구입", amount: 30000, method: "cash",
    client_id: null, client_name: "동네 문구점", has_receipt: false, memo: null, proof_type: null, proof_type_detail: null,
    card_type: null, bank_type: null, card_pending: false, card_used_date: null, occurred_date: null, created_at: "x", ...over,
  }) as Payment;

function renderTable(payments: Payment[]) {
  const onAttachReceipt = vi.fn();
  render(<PaymentsTable payments={payments} onSelect={vi.fn()} onPrint={vi.fn()} onDownloadExcel={vi.fn()} onDelete={vi.fn()} onAttachReceipt={onAttachReceipt} />);
  return onAttachReceipt;
}

describe("영수증 나중에 올리기", () => {
  it("영수증이 없는 지출 줄에만 영수증 첨부 아이콘이 있다", () => {
    renderTable([pay(), pay({ id: 2, has_receipt: true }), pay({ id: 3, type: "deposit" })]);
    expect(screen.getAllByRole("button", { name: "영수증 첨부" })).toHaveLength(1);
    expect(screen.getAllByTitle("영수증 보기")).toHaveLength(1); // 이미 올린 줄은 영수증 보기
  });

  it("고른 사진 파일을 그 줄의 지출과 함께 올린다", () => {
    const onAttach = renderTable([pay({ id: 7 })]);
    const input = screen.getByLabelText("토너 구입 영수증 파일") as HTMLInputElement;
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onAttach.mock.calls[0][0].id).toBe(7);
    expect(onAttach.mock.calls[0][1]).toBe(file);
  });
});
