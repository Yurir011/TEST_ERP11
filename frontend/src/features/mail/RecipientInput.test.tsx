// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailBridge, MailContact } from "../../lib/desktop";
import { RecipientInput } from "./RecipientInput";
import { applyContact, currentTokenStart, extractEmails } from "./recipientText";

const BOOK: MailContact[] = [
  { name: "박영업", address: "park@a.com" },
  { name: "", address: "plain@b.com" },
  { name: "김, 철수", address: "kim@c.com" },
];

function makeBridge(book: MailContact[] = BOOK) {
  return {
    contacts: vi.fn((q: string, limit?: number) => {
      const s = q.trim().toLowerCase();
      const list = book.filter((c) => !s || c.name.toLowerCase().includes(s) || c.address.toLowerCase().includes(s));
      return Promise.resolve(list.slice(0, limit ?? 8));
    }),
    removeContact: vi.fn().mockResolvedValue(true),
  } as unknown as MailBridge & { contacts: ReturnType<typeof vi.fn>; removeContact: ReturnType<typeof vi.fn> };
}

function Harness({ bridge, initial = "" }: { bridge: MailBridge; initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="to">받는사람</label>
      <RecipientInput id="to" bridge={bridge} value={v} onChange={setV} className="" />
      <output data-testid="value">{v}</output>
    </form>
  );
}

afterEach(cleanup);
const input = () => screen.getByLabelText("받는사람") as HTMLInputElement;
const value = () => screen.getByTestId("value").textContent;
const options = async () => within(await screen.findByRole("listbox", { name: "보낸 적 있는 주소" })).getAllByRole("option");

describe("글 처리 도우미", () => {
  it("마지막 조각의 위치와 고른 연락처 넣기", () => {
    expect(currentTokenStart("a@x.com, bo")).toBe(8); // 쉼표 바로 다음(공백 포함)부터가 마지막 조각
    expect(currentTokenStart("")).toBe(0);
    expect(applyContact("", { name: "박영업", address: "park@a.com" })).toBe("박영업 <park@a.com>, ");
    expect(applyContact("a@x.com, bo", { name: "", address: "bob@x.com" })).toBe("a@x.com, bob@x.com, ");
    expect(applyContact("a@x.com; ", { name: "김, 철수", address: "kim@c.com" })).toBe("a@x.com; 김 철수 <kim@c.com>, "); // 이름의 쉼표·꺾쇠는 주소 구분을 깨므로 뺀다
  });

  it("주소 뽑기: 이름 붙은 주소·중복", () => {
    expect(extractEmails("홍길동 <a@x.com>, B@Y.com; c@z.kr", "a@X.com, 잘못된주소")).toEqual(["a@x.com", "B@Y.com", "c@z.kr"]);
  });
});

describe("받는 사람 자동완성", () => {
  it("빈 칸을 누르면 보낸 적 있는 주소들이 나타난다", async () => {
    const bridge = makeBridge();
    render(<Harness bridge={bridge} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(input());
    expect((await options()).map((o) => o.textContent?.replace(" 주소록에서 지우기", ""))).toEqual(expect.arrayContaining([expect.stringContaining("park@a.com"), expect.stringContaining("plain@b.com")]));
    expect(bridge.contacts).toHaveBeenCalledWith("", expect.any(Number));
  });

  it("후보를 누르면 '이름 <주소>, ' 로 채워지고 칸에 포커스가 남는다", async () => {
    render(<Harness bridge={makeBridge()} />);
    input().focus();
    fireEvent.focus(input());
    const list = await options();
    fireEvent.click(within(list[0]).getByText(/park@a\.com/));
    expect(value()).toBe("박영업 <park@a.com>, ");
  });

  it("글을 쓰면 이름·주소에 맞는 후보만 남고, 마지막 조각만 바뀐다", async () => {
    const bridge = makeBridge();
    render(<Harness bridge={bridge} initial="first@x.com, " />);
    fireEvent.change(input(), { target: { value: "first@x.com, pla" } });
    const list = await options();
    expect(list).toHaveLength(1);
    expect(list[0].textContent).toContain("plain@b.com");
    expect(bridge.contacts).toHaveBeenCalledWith("pla", expect.any(Number));
    fireEvent.click(within(list[0]).getByText("plain@b.com"));
    expect(value()).toBe("first@x.com, plain@b.com, ");
  });

  it("이미 입력한 주소는 후보에서 뺀다", async () => {
    render(<Harness bridge={makeBridge()} initial="park@a.com, " />);
    fireEvent.focus(input());
    const text = (await options()).map((o) => o.textContent).join("|");
    expect(text).not.toContain("park@a.com");
    expect(text).toContain("plain@b.com");
  });

  it("방향키로 고르고 Enter 로 넣는다 (Enter 가 보내기로 넘어가지 않는다)", async () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const bridge = makeBridge();
    function F() {
      const [v, setV] = useState("");
      return (
        <form onSubmit={submit}>
          <label htmlFor="to">받는사람</label>
          <RecipientInput id="to" bridge={bridge} value={v} onChange={setV} className="" />
          <output data-testid="value">{v}</output>
        </form>
      );
    }
    render(<F />);
    fireEvent.focus(input());
    await options();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    const proceeded = fireEvent.keyDown(input(), { key: "Enter" }); // false 면 기본 동작(폼 제출)을 막았다는 뜻
    expect(proceeded).toBe(false);
    expect(value()).toBe("plain@b.com, ");
    expect(submit).not.toHaveBeenCalled();
  });

  it("후보를 고르지 않은 Enter 는 막지 않고, Escape 는 목록을 닫는다", async () => {
    render(<Harness bridge={makeBridge()} />);
    fireEvent.focus(input());
    await options();
    const prevented = !fireEvent.keyDown(input(), { key: "Enter" }); // 아무것도 고르지 않았다
    expect(prevented).toBe(false);
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("바깥을 누르면 목록이 닫힌다", async () => {
    render(<Harness bridge={makeBridge()} />);
    fireEvent.focus(input());
    await options();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("후보의 ×를 누르면 주소록에서 지우고 목록에서도 사라진다", async () => {
    const bridge = makeBridge();
    render(<Harness bridge={bridge} />);
    fireEvent.focus(input());
    await options();
    fireEvent.click(screen.getByRole("button", { name: "park@a.com 주소록에서 지우기" }));
    await waitFor(() => expect(bridge.removeContact).toHaveBeenCalledWith("park@a.com"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "park@a.com 주소록에서 지우기" })).toBeNull());
    expect(value()).toBe(""); // 지우기가 입력칸에 주소를 넣지는 않는다
  });

  it("주소록이 비어 있으면 아무것도 보이지 않는다", async () => {
    const bridge = makeBridge([]);
    render(<Harness bridge={bridge} />);
    fireEvent.focus(input());
    await waitFor(() => expect(bridge.contacts).toHaveBeenCalled());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("늦게 도착한 이전 글의 결과가 최신 결과를 덮어쓰지 않는다", async () => {
    let resolveSlow: (v: MailContact[]) => void = () => {};
    const bridge = {
      contacts: vi.fn((q: string) => (q === "p" ? new Promise<MailContact[]>((r) => (resolveSlow = r)) : Promise.resolve([{ name: "", address: "plain@b.com" }]))),
      removeContact: vi.fn(),
    } as unknown as MailBridge;
    render(<Harness bridge={bridge} />);
    fireEvent.change(input(), { target: { value: "p" } });
    await waitFor(() => expect(bridge.contacts).toHaveBeenCalledWith("p", expect.any(Number)));
    fireEvent.change(input(), { target: { value: "pl" } });
    expect((await options())[0].textContent).toContain("plain@b.com");
    resolveSlow([{ name: "오래된", address: "stale@x.com" }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/stale@x\.com/)).toBeNull();
  });
});
