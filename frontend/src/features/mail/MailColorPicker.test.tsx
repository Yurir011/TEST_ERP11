// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailColorPicker } from "./MailColorPicker";
import { hexToHsv, hsvToHex, normalizeHex } from "./mailAccent";

afterEach(cleanup);

describe("색 변환", () => {
  it("hex → HSV → hex 로 되돌려도 같은 색이다", () => {
    for (const hex of ["#b0609f", "#4b5fd6", "#ffd700", "#000000", "#ffffff", "#808080"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("색 코드 입력은 #·3자리·대문자를 바로잡고 잘못된 값은 null", () => {
    expect(normalizeHex("B0609F")).toBe("#b0609f");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("빨강")).toBeNull();
  });
});

describe("MailColorPicker", () => {
  it("[확인]을 눌러야 고른 색이 넘어간다", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<MailColorPicker initial="#4b5fd6" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText("색 코드"), { target: { value: "#ff8800" } });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(onConfirm).toHaveBeenCalledWith("#ff8800");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("[취소]와 Esc 는 적용하지 않고 닫는다", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<MailColorPicker initial="#4b5fd6" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("창 바깥을 누르면 취소로 본다", () => {
    const onCancel = vi.fn();
    render(<MailColorPicker initial="#4b5fd6" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.mouseDown(document.body);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("색상 막대를 움직이면 색 코드가 따라 바뀐다", () => {
    render(<MailColorPicker initial="#ff0000" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("색상"), { target: { value: "120" } });
    expect((screen.getByLabelText("색 코드") as HTMLInputElement).value).toBe("#00ff00");
  });
});
