// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTextInput, formatDateDigits, isValidDateText } from "./DateTextInput";

afterEach(cleanup);

describe("날짜 글자 다루기", () => {
  it("숫자만 골라 YYYY-MM-DD 로 맞춘다", () => {
    expect(formatDateDigits("20261022")).toBe("2026-10-22");
    expect(formatDateDigits("2026-10-2")).toBe("2026-10-2");
    expect(formatDateDigits("2026")).toBe("2026");
    expect(formatDateDigits("20261")).toBe("2026-1");
    expect(formatDateDigits("2026102299")).toBe("2026-10-22");
    expect(formatDateDigits("abc")).toBe("");
  });

  it("없는 날짜는 올바르지 않다", () => {
    expect(isValidDateText("2026-10-22")).toBe(true);
    expect(isValidDateText("2026-02-30")).toBe(false);
    expect(isValidDateText("2026-13-01")).toBe(false);
    expect(isValidDateText("2026-1-1")).toBe(false);
  });
});

describe("날짜 입력 칸", () => {
  const setup = (value = "") => {
    const onCommit = vi.fn();
    render(<DateTextInput aria-label="시작일" value={value} onCommit={onCommit} />);
    return { onCommit, input: screen.getByLabelText("시작일") as HTMLInputElement };
  };

  it("숫자를 치는 동안에는 저장하지 않고, 8자리를 채우고 Enter 를 누르면 저장한다", () => {
    const { onCommit, input } = setup();
    for (const typed of ["2", "20", "2026", "202610", "20261022"]) fireEvent.change(input, { target: { value: typed } });
    expect(input.value).toBe("2026-10-22");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("2026-10-22");
  });

  it("칸을 벗어나도 저장하고, 없는 날짜는 저장하지 않고 표시한다", () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: "20260230" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "20260228" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("2026-02-28");
  });

  it("다 지우면 날짜를 비운다. 바뀐 게 없으면 저장하지 않는다", () => {
    const { onCommit, input } = setup("2026-10-01");
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("Esc 는 입력하던 것을 취소하고 저장된 값으로 돌린다", () => {
    const { onCommit, input } = setup("2026-10-01");
    fireEvent.change(input, { target: { value: "2026" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("2026-10-01");
    expect(onCommit).not.toHaveBeenCalled();
  });
});
