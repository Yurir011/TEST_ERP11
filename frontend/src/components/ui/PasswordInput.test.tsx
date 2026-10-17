// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordInput } from "./PasswordInput";

afterEach(cleanup);

describe("PasswordInput", () => {
  it("처음에는 가려져 있고, 눈 버튼을 누를 때마다 보임/숨김이 바뀐다", () => {
    render(<PasswordInput id="pw" defaultValue="secret" />);
    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("secret");
    expect(screen.getByRole("button", { name: "비밀번호 숨기기" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 숨기기" }));
    expect(input.type).toBe("password");
  });

  it("눈 버튼은 submit 버튼이 아니어서 폼이 제출되지 않는다", () => {
    let submitted = false;
    render(
      <form onSubmit={(e) => { e.preventDefault(); submitted = true; }}>
        <PasswordInput />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(submitted).toBe(false);
  });

  it("전달한 속성(required, onChange 등)이 입력칸에 그대로 적용된다", () => {
    let value = "";
    render(<PasswordInput id="pw" required onChange={(e) => { value = e.target.value; }} />);
    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.required).toBe(true);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(value).toBe("abc");
  });
});
