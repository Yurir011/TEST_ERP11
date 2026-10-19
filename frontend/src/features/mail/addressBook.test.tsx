// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressBookEntry, ContactInput, MailBridge } from "../../lib/desktop";
import { AddressBookView } from "./AddressBookView";
import { ContactPicker } from "./ContactPicker";
import { appendContacts } from "./recipientText";

const confirm = vi.hoisted(() => vi.fn());
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm, notify: vi.fn(), notifyError: vi.fn() }) }));

const entry = (name: string, address: string, memo = "", manual = true): AddressBookEntry => ({ name, address, memo, manual, lastUsed: 0 });
const BOOK = [entry("김영업", "kim@a.com", "한빛통신"), entry("박대리", "park@b.com"), entry("", "plain@c.com", "", false)];

function makeBridge(initial: AddressBookEntry[] = BOOK) {
  let book = [...initial];
  const bridge = {
    addressBook: vi.fn((q: string) => {
      const s = q.trim().toLowerCase();
      return Promise.resolve(book.filter((e) => !s || `${e.name} ${e.address} ${e.memo}`.toLowerCase().includes(s)));
    }),
    saveContact: vi.fn((input: ContactInput) => {
      if (!input.address.includes("@")) return Promise.resolve({ ok: false as const, error: `올바르지 않은 메일 주소입니다: ${input.address}` });
      book = book.filter((e) => e.address !== (input.oldAddress ?? input.address));
      const saved = entry(input.name, input.address, input.memo);
      book.push(saved);
      return Promise.resolve({ ok: true as const, value: saved });
    }),
    removeContact: vi.fn((address: string) => {
      book = book.filter((e) => e.address !== address);
      return Promise.resolve(true);
    }),
  };
  return bridge as unknown as MailBridge & typeof bridge;
}

beforeEach(() => confirm.mockReset());
afterEach(cleanup);

describe("appendContacts (여러 사람 넣기)", () => {
  it("빈 칸에는 '이름 <주소>, ' 로, 기존 글 뒤에는 이어 붙이고 이미 있는 주소는 건너뛴다", () => {
    expect(appendContacts("", [entry("김영업", "kim@a.com"), entry("", "plain@c.com")])).toBe("김영업 <kim@a.com>, plain@c.com, ");
    expect(appendContacts("x@y.com", [entry("김영업", "kim@a.com")])).toBe("x@y.com, 김영업 <kim@a.com>, ");
    expect(appendContacts("kim@a.com, ", [entry("김영업", "KIM@a.com"), entry("박대리", "park@b.com")])).toBe("kim@a.com, 박대리 <park@b.com>, ");
    expect(appendContacts("", [entry("김, 철수", "k@c.com")])).toBe("김 철수 <k@c.com>, "); // 이름의 쉼표·꺾쇠는 뺀다
  });
});

describe("주소록 화면", () => {
  it("이름·주소·메모를 목록으로 보여 주고, 이름이 없으면 안내한다", async () => {
    render(<AddressBookView bridge={makeBridge()} onCompose={vi.fn()} />);
    expect(await screen.findByText("김영업")).toBeTruthy();
    expect(screen.getByText("kim@a.com")).toBeTruthy();
    expect(screen.getByText("한빛통신")).toBeTruthy();
    expect(screen.getByText("(이름 없음)")).toBeTruthy();
  });

  it("검색하면 이름·주소·메모에 맞는 사람만 남고, 없으면 안내한다", async () => {
    const bridge = makeBridge();
    render(<AddressBookView bridge={bridge} onCompose={vi.fn()} />);
    await screen.findByText("김영업");
    fireEvent.change(screen.getByLabelText("주소록 검색"), { target: { value: "한빛" } });
    await waitFor(() => expect(screen.queryByText("박대리")).toBeNull());
    expect(screen.getByText("김영업")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("주소록 검색"), { target: { value: "없는말" } });
    expect(await screen.findByText("검색 결과가 없습니다.")).toBeTruthy();
  });

  it("비어 있으면 추가 방법을 안내한다", async () => {
    render(<AddressBookView bridge={makeBridge([])} onCompose={vi.fn()} />);
    expect(await screen.findByText(/주소록이 비어 있습니다/)).toBeTruthy();
  });

  it("[연락처 추가]에서 입력해 저장하면 목록에 나타난다", async () => {
    const bridge = makeBridge();
    render(<AddressBookView bridge={bridge} onCompose={vi.fn()} />);
    await screen.findByText("김영업");
    fireEvent.click(screen.getByRole("button", { name: "연락처 추가" }));
    const dialog = await screen.findByRole("dialog", { name: "연락처 추가" });
    const inputs = within(dialog).getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "최팀장" } });
    fireEvent.change(inputs[1], { target: { value: "choi@d.com" } });
    fireEvent.change(inputs[2], { target: { value: "신규 거래처" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(bridge.saveContact).toHaveBeenCalledWith({ name: "최팀장", address: "choi@d.com", memo: "신규 거래처", oldAddress: undefined }));
    expect(await screen.findByText("최팀장")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("저장이 거절되면 이유를 보여 주고 창을 닫지 않는다", async () => {
    render(<AddressBookView bridge={makeBridge()} onCompose={vi.fn()} />);
    await screen.findByText("김영업");
    fireEvent.click(screen.getByRole("button", { name: "연락처 추가" }));
    const dialog = await screen.findByRole("dialog", { name: "연락처 추가" });
    fireEvent.change(within(dialog).getAllByRole("textbox")[1], { target: { value: "not-an-email" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "연락처 추가" })).toBeTruthy();
  });

  it("[수정]은 기존 값을 채워 열고, 주소를 바꾸면 예전 주소를 함께 알린다", async () => {
    const bridge = makeBridge();
    render(<AddressBookView bridge={bridge} onCompose={vi.fn()} />);
    await screen.findByText("김영업");
    fireEvent.click(screen.getByRole("button", { name: "김영업 수정" }));
    const dialog = await screen.findByRole("dialog", { name: "연락처 수정" });
    const inputs = within(dialog).getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["김영업", "kim@a.com", "한빛통신"]);
    fireEvent.change(inputs[1], { target: { value: "kim@new.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(bridge.saveContact).toHaveBeenCalledWith({ name: "김영업", address: "kim@new.com", memo: "한빛통신", oldAddress: "kim@a.com" }));
    expect(await screen.findByText("kim@new.com")).toBeTruthy();
    expect(screen.queryByText("kim@a.com")).toBeNull();
  });

  it("[삭제]는 확인을 받은 뒤에만 지운다", async () => {
    const bridge = makeBridge();
    render(<AddressBookView bridge={bridge} onCompose={vi.fn()} />);
    await screen.findByText("김영업");
    confirm.mockResolvedValue(false);
    fireEvent.click(screen.getByRole("button", { name: "김영업 삭제" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(bridge.removeContact).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "김영업 삭제" }));
    await waitFor(() => expect(bridge.removeContact).toHaveBeenCalledWith("kim@a.com"));
    await waitFor(() => expect(screen.queryByText("김영업")).toBeNull());
  });

  it("한 사람의 [메일쓰기]와 체크한 여러 사람 [메일쓰기]는 받는 사람 글을 만들어 넘긴다", async () => {
    const onCompose = vi.fn();
    render(<AddressBookView bridge={makeBridge()} onCompose={onCompose} />);
    await screen.findByText("김영업");
    expect((screen.getByRole("button", { name: /선택한 0명에게 메일쓰기/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "박대리 에게 메일쓰기" }));
    expect(onCompose).toHaveBeenLastCalledWith("박대리 <park@b.com>, ");
    fireEvent.click(screen.getByLabelText("김영업 선택"));
    fireEvent.click(screen.getByLabelText("(이름 없음) 선택".replace("(이름 없음)", "plain@c.com")));
    fireEvent.click(screen.getByRole("button", { name: /선택한 2명에게 메일쓰기/ }));
    expect(onCompose).toHaveBeenLastCalledWith("김영업 <kim@a.com>, plain@c.com, ");
  });
});

describe("메일쓰기의 주소록 고르기", () => {
  it("여러 명을 체크해 받는사람·참조·숨은참조 중 한 곳에 넣는다", async () => {
    const onPick = vi.fn();
    render(<ContactPicker bridge={makeBridge()} onPick={onPick} onClose={vi.fn()} />);
    await screen.findByText("김영업");
    for (const b of screen.getAllByRole("button", { name: /에 추가/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("김영업 선택"));
    fireEvent.click(screen.getByLabelText("박대리 선택"));
    expect(screen.getByText("2명 선택")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "참조에 추가" }));
    expect(onPick).toHaveBeenCalledWith("cc", [expect.objectContaining({ address: "kim@a.com" }), expect.objectContaining({ address: "park@b.com" })]);
  });

  it("검색을 바꿔도 체크한 사람은 유지된다", async () => {
    const onPick = vi.fn();
    render(<ContactPicker bridge={makeBridge()} onPick={onPick} onClose={vi.fn()} />);
    await screen.findByText("김영업");
    fireEvent.click(screen.getByLabelText("김영업 선택"));
    fireEvent.change(screen.getByLabelText("주소록 검색"), { target: { value: "박대리" } });
    await waitFor(() => expect(screen.queryByText("김영업")).toBeNull());
    fireEvent.click(screen.getByLabelText("박대리 선택"));
    fireEvent.click(screen.getByRole("button", { name: "받는사람에 추가" }));
    expect(onPick).toHaveBeenCalledWith("to", expect.arrayContaining([expect.objectContaining({ address: "kim@a.com" }), expect.objectContaining({ address: "park@b.com" })]));
  });

  it("비어 있으면 안내하고 닫기를 누르면 닫는다", async () => {
    const onClose = vi.fn();
    render(<ContactPicker bridge={makeBridge([])} onPick={vi.fn()} onClose={onClose} />);
    expect(await screen.findByText("주소록이 비어 있습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalled();
  });
});
