// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentItemsEditor } from "./DocumentItemsEditor";
import { MAX_PROJECT_DOC_ITEMS, type DocCurrency } from "./types";

afterEach(cleanup);

const item = (quantity: string, unit_price: string, content = "품목") => ({ content, quantity, unit_price, note: "" });

function renderEditor(items = [item("15", "4.1"), item("3", "454545.5")], onCurrencyChange: ((c: DocCurrency) => void) | null = vi.fn()) {
  const handlers = { onAdd: vi.fn(), onRemove: vi.fn(), onUpdate: vi.fn() };
  render(<DocumentItemsEditor items={items} currency="KRW" onCurrencyChange={onCurrencyChange} {...handlers} />);
  return handlers;
}

describe("DocumentItemsEditor", () => {
  it("품목 금액과 합계를 서버와 같은 사사오입으로 보여준다", () => {
    renderEditor();
    // 15 × 4.1 = 61.5 → 62 (소수 곱셈 오차로 61 이 되던 경우), 3 × 454,545.5 = 1,363,636.5 → 1,363,637
    expect(screen.getByText("₩62")).toBeTruthy();
    expect(screen.getByText("₩1,363,637")).toBeTruthy();
    const totals = within(screen.getByLabelText("총금액"));
    expect(totals.getByText("₩1,363,699")).toBeTruthy(); // 공급가액
    expect(totals.getByText("₩136,370")).toBeTruthy(); // 부가세 10%
    expect(totals.getByText("₩1,500,069")).toBeTruthy(); // 합계
  });

  it("입력·추가·삭제를 부모에게 알린다", () => {
    const h = renderEditor();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "RF 모듈" } });
    expect(h.onUpdate).toHaveBeenCalledWith(0, "content", "RF 모듈");
    fireEvent.click(screen.getByRole("button", { name: /항목 추가/ }));
    expect(h.onAdd).toHaveBeenCalled();
    fireEvent.click(screen.getAllByTitle("항목 삭제")[1]);
    expect(h.onRemove).toHaveBeenCalledWith(1);
  });

  it("품목이 하나면 삭제 버튼이 없고, 최대 개수면 추가 버튼이 비활성", () => {
    renderEditor([item("1", "1000")]);
    expect(screen.queryByTitle("항목 삭제")).toBeNull();
    cleanup();
    renderEditor(Array.from({ length: MAX_PROJECT_DOC_ITEMS }, () => item("1", "1")));
    expect((screen.getByRole("button", { name: /항목 추가/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("단가 단위 선택은 onCurrencyChange 가 있을 때만 (세금계산서는 원화만)", () => {
    renderEditor(undefined, null);
    expect(screen.queryByText("단가 단위")).toBeNull();
    cleanup();
    const onCurrency = vi.fn();
    renderEditor(undefined, onCurrency);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "USD" } });
    expect(onCurrency).toHaveBeenCalledWith("USD");
  });
});
