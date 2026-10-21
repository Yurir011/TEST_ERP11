// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountName } from "./AccountName";
import { resetPaymentAccountsForTest } from "./paymentAccounts";
import { TEST_ACCOUNTS } from "./testAccounts";

beforeEach(() =>
  resetPaymentAccountsForTest([
    ...TEST_ACCOUNTS,
    { ...TEST_ACCOUNTS[0], id: 9, code: "card_ab12", nickname: "대표님 카드", issuer: "신한카드", last4: "1234" },
  ]),
);
afterEach(cleanup);

describe("카드·계좌 이름 (별명)", () => {
  it("평소에는 별명만 보이고 카드사·뒤 4자리는 숨겨져 있다", () => {
    render(<AccountName kind="card" code="card_ab12" />);
    expect(screen.getByText("대표님 카드")).toBeTruthy();
    expect(screen.queryByText(/신한카드/)).toBeNull();
    expect(screen.queryByText(/1234/)).toBeNull();
  });

  it("누르면 카드사와 뒤 4자리가 보이고, 다시 누르면 접힌다", () => {
    render(<AccountName kind="card" code="card_ab12" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(screen.getByText(/신한카드 ····1234/)).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByText(/신한카드/)).toBeNull();
  });

  it("뒤 4자리가 없으면 카드사만 보이고, 목록에 없는 값은 값 그대로 보인다", () => {
    render(<AccountName kind="card" code="bc" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/\(BC카드\)/)).toBeTruthy();
    cleanup();
    render(<AccountName kind="bank" code="unknown_code" />);
    expect(screen.getByText("unknown_code")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("눌러도 표의 줄 클릭(상세 열기)으로 퍼지지 않는다", () => {
    let rowClicks = 0;
    render(
      <div onClick={() => (rowClicks += 1)}>
        <AccountName kind="card" code="bc" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(rowClicks).toBe(0);
  });
});
