// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconAction } from "./IconAction";

afterEach(cleanup);

describe("IconAction", () => {
  it("이름을 접근성 이름과 마우스 올림 말풍선으로 보여주고, 누르면 실행한다", () => {
    const onClick = vi.fn();
    render(<IconAction label="정기 자동이체" onClick={onClick}><svg /></IconAction>);
    const btn = screen.getByRole("button", { name: "정기 자동이체" });
    expect(screen.getByRole("tooltip").textContent).toBe("정기 자동이체");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("건수 배지는 1건 이상일 때만 보이고, 비활성이면 누를 수 없다", () => {
    const { rerender } = render(<IconAction label="카드 결제일 일괄처리" onClick={vi.fn()} badge={0}><svg /></IconAction>);
    expect(screen.queryByText("0")).toBeNull();
    rerender(<IconAction label="카드 결제일 일괄처리" onClick={vi.fn()} badge={3} disabled><svg /></IconAction>);
    expect(screen.getByText("3")).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
