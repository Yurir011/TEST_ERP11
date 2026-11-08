// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInput } from "./MessageInput";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

function pick(files: File[]) {
  render(<MessageInput onSend={vi.fn()} onAttach={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("첨부할 파일"), { target: { files } });
}

describe("보낼 이미지 미리보기", () => {
  it("이미지는 작은 미리보기 그림을 보여 주고, 누르면 크게 보였다가 닫힌다", () => {
    pick([new File(["x"], "사진.png", { type: "image/png" })]);
    const thumb = screen.getByAltText("사진.png");
    expect(thumb.getAttribute("src")).toBe("blob:preview");
    fireEvent.click(screen.getByLabelText("사진.png 크게 보기"));
    const dialog = screen.getByRole("dialog", { name: "이미지 미리보기" });
    expect(dialog).toBeTruthy();
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog", { name: "이미지 미리보기" })).toBeNull();
  });

  it("이미지가 아닌 파일은 미리보기 그림 없이 이름만 보인다", () => {
    pick([new File(["x"], "견적.pdf", { type: "application/pdf" })]);
    expect(screen.getByText("견적.pdf")).toBeTruthy();
    expect(screen.queryByAltText("견적.pdf")).toBeNull();
  });
});
