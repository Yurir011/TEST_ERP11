// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateField } from "./DateField";

afterEach(cleanup);

function Harness({ onChange, max }: { onChange: (v: string) => void; max?: string }) {
  const [v, setV] = useState("");
  return (
    <DateField
      aria-label="날짜"
      value={v}
      max={max}
      onChange={(x) => {
        setV(x);
        onChange(x);
      }}
    />
  );
}

const type = (el: HTMLElement, text: string) => {
  // 한 글자씩 연달아 쳐서 8자리를 입력하는 모양을 흉내 낸다
  let cur = "";
  for (const ch of text) {
    cur += ch;
    fireEvent.change(el, { target: { value: (el as HTMLInputElement).value + ch } });
  }
  return cur;
};

describe("날짜 칸 (숫자 8자리 연달아 입력)", () => {
  it("연 4자리·월 2자리·일 2자리를 이어서 치면 하이픈이 자동으로 들어가고 다 입력했을 때만 값을 보낸다", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText("날짜") as HTMLInputElement;
    type(input, "2026");
    expect(input.value).toBe("2026");
    type(input, "10");
    expect(input.value).toBe("2026-10");
    type(input, "2");
    expect(onChange).not.toHaveBeenCalled(); // 아직 8자리가 아니다
    type(input, "2");
    expect(input.value).toBe("2026-10-22");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-10-22");
  });

  it("없는 날짜나 허용 범위를 넘는 날짜는 값으로 보내지 않는다", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} max="2026-11-26" />);
    const input = screen.getByLabelText("날짜") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "20260230" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "20261201" } }); // max 이후
    expect(onChange).not.toHaveBeenCalled();
  });

  it("칸을 모두 지우면 빈 값을 보낸다", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText("날짜") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "20261022" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
