// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceProposalPicker } from "./ReferenceProposalPicker";
import type { Proposal } from "./types";

afterEach(cleanup);

const options = [
  { id: 1, title: "모니터", issue_date: "2026-10-02", doc_no: "BS-품의-RND-261002-01" },
  { id: 2, title: "샘플", issue_date: "2026-10-02", doc_no: "BS-품의-RND-261002-02" },
] as unknown as Proposal[];

function renderPicker(over: Partial<Parameters<typeof ReferenceProposalPicker>[0]> = {}) {
  const h = { onChange: vi.fn(), onToggle: vi.fn() };
  render(<ReferenceProposalPicker options={options} value={null} open={false} {...h} {...over} />);
  return h;
}

describe("참조할 품의서 선택", () => {
  it("승인된 구매 품의서 목록을 보여 주고, 고르기 전에는 참조 버튼이 꺼져 있다", () => {
    renderPicker();
    const select = screen.getByLabelText("참조할 품의서") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "선택 안 함",
      "모니터 · 2026-10-02 · BS-품의-RND-261002-01",
      "샘플 · 2026-10-02 · BS-품의-RND-261002-02",
    ]);
    expect((screen.getByRole("button", { name: "품의서 참조" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("품의서를 고르면 번호로, 선택 안 함을 고르면 null 로 알린다", () => {
    const h = renderPicker();
    fireEvent.change(screen.getByLabelText("참조할 품의서"), { target: { value: "2" } });
    expect(h.onChange).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText("참조할 품의서"), { target: { value: "" } });
    expect(h.onChange).toHaveBeenCalledWith(null);
  });

  it("고른 뒤에는 참조 버튼으로 패널을 열고 닫는다", () => {
    const h = renderPicker({ value: 1 });
    fireEvent.click(screen.getByRole("button", { name: "품의서 참조" }));
    expect(h.onToggle).toHaveBeenCalledTimes(1);
    cleanup();
    renderPicker({ value: 1, open: true });
    expect(screen.getByRole("button", { name: "참조 닫기" })).toBeTruthy();
  });
});
