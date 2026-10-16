// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientContactsEditor } from "./ClientContactsEditor";
import { EMPTY_CLIENT_CONTACT } from "./types";

afterEach(cleanup);

describe("ClientContactsEditor", () => {
  it("담당자가 없으면 안내 문구, [담당자 추가]를 누르면 알린다", () => {
    const onAdd = vi.fn();
    render(<ClientContactsEditor contacts={[]} onAdd={onAdd} onRemove={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByText(/등록된 담당자가 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /담당자 추가/ }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("입력과 삭제를 몇 번째 담당자인지와 함께 알린다", () => {
    const onRemove = vi.fn();
    const onUpdate = vi.fn();
    render(
      <ClientContactsEditor
        contacts={[{ ...EMPTY_CLIENT_CONTACT, name: "김담당" }, { ...EMPTY_CLIENT_CONTACT }]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onUpdate={onUpdate}
      />
    );
    expect((screen.getAllByPlaceholderText("이름")[0] as HTMLInputElement).value).toBe("김담당");
    fireEvent.change(screen.getAllByPlaceholderText("휴대폰")[1], { target: { value: "010-1234-5678" } });
    expect(onUpdate).toHaveBeenCalledWith(1, "mobile_phone", "010-1234-5678");
    fireEvent.click(screen.getAllByTitle("담당자 삭제")[0]);
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
