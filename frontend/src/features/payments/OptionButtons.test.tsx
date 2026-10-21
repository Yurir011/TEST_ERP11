// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptionButtons } from "./OptionButtons";
const BANK_TYPE_LABELS = { ibk: "기업은행", kb_kookmin: "KB국민은행", woori: "우리은행" };

afterEach(cleanup);

describe("OptionButtons", () => {
  it("모든 선택지를 보여주고, 고른 것만 강조한다", () => {
    const onSelect = vi.fn();
    render(<OptionButtons labels={BANK_TYPE_LABELS} value="woori" onSelect={onSelect} columns={3} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(Object.values(BANK_TYPE_LABELS));
    const selected = buttons.filter((b) => b.className.includes("border-primary"));
    expect(selected.map((b) => b.textContent)).toEqual([BANK_TYPE_LABELS.woori]);

    fireEvent.click(screen.getByRole("button", { name: BANK_TYPE_LABELS.ibk }));
    expect(onSelect).toHaveBeenCalledWith("ibk");
  });

  it("아무것도 고르지 않은 상태", () => {
    render(<OptionButtons labels={BANK_TYPE_LABELS} value={null} onSelect={() => {}} columns={3} />);
    expect(screen.getAllByRole("button").some((b) => b.className.includes("border-primary"))).toBe(false);
  });
});
