// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchClient, NewMailItem } from "../../lib/desktop";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { id: 1, name: "박소장", role: "admin", title: null, menu_permissions: [] }, logout: vi.fn() }) }));
vi.mock("../../features/todos/TodoPanel", () => ({ TodoPanel: () => null }));
vi.mock("./VersionLabel", () => ({ VersionLabel: () => null }));
vi.mock("../../features/desktop/DesktopDownloadLink", () => ({ DesktopDownloadLink: () => null }));
const { apiGet, apiPut } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPut: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiGet, apiPut }));

import { Sidebar } from "./Sidebar";

beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
  apiGet.mockImplementation((path: string) => Promise.resolve(path === "/api/mail/unread" ? { unread: null } : { count: 0 }));
  apiPut.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  delete window.benchClient;
});

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );

describe("사이드바의 메일 버튼", () => {
  it("브라우저에는 메일 메뉴가 없다", () => {
    renderSidebar();
    expect(screen.queryByText("메일")).toBeNull();
  });

  it("메일 기능이 없는 예전 앱에도 없다", () => {
    window.benchClient = {} as unknown as BenchClient;
    renderSidebar();
    expect(screen.queryByText("메일")).toBeNull();
  });

  it("앱에서는 링크가 아니라 버튼이고, 누르면 별도 메일 창을 연다", () => {
    const openWindow = vi.fn().mockResolvedValue(undefined);
    window.benchClient = { mail: { openWindow } } as unknown as BenchClient;
    renderSidebar();
    const button = screen.getByRole("button", { name: "메일" });
    expect(screen.queryByRole("link", { name: "메일" })).toBeNull();
    fireEvent.click(button);
    expect(openWindow).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(openWindow).toHaveBeenCalledTimes(2); // 이미 열려 있으면 앱이 그 창을 앞으로 가져온다
  });

  it("다른 메뉴는 그대로 링크다", () => {
    window.benchClient = { mail: { openWindow: vi.fn() } } as unknown as BenchClient;
    renderSidebar();
    expect(screen.getByRole("link", { name: "메신저" })).toBeTruthy();
  });
});

describe("안 읽은 메일 수", () => {
  it("앱: 메일 버튼에 이 PC 의 숫자를 보이고, 서버에 숫자만 알린다", async () => {
    const unread = vi.fn().mockResolvedValue(3);
    window.benchClient = { mail: { openWindow: vi.fn(), unread, onUnread: vi.fn(() => () => {}) } } as unknown as BenchClient;
    renderSidebar();
    expect(await screen.findByLabelText("안 읽은 메일 3통")).toBeTruthy();
    expect(apiPut).toHaveBeenCalledWith("/api/mail/unread", { unread: 3 });
    expect(apiGet).not.toHaveBeenCalledWith("/api/mail/unread"); // 앱은 서버에서 읽지 않는다
  });

  it("앱: 안 읽은 수가 바뀌면 화면과 서버가 따라가고, 같은 숫자는 다시 알리지 않는다", async () => {
    let push: (p: { unread: number }) => void = () => {};
    window.benchClient = { mail: { openWindow: vi.fn(), unread: vi.fn().mockResolvedValue(1), onUnread: vi.fn((cb: typeof push) => { push = cb; return () => {}; }) } } as unknown as BenchClient;
    renderSidebar();
    await screen.findByLabelText("안 읽은 메일 1통");
    push({ unread: 1 });
    push({ unread: 5 });
    expect(await screen.findByLabelText("안 읽은 메일 5통")).toBeTruthy();
    expect(apiPut.mock.calls.map((c) => c[1].unread)).toEqual([1, 5]);
  });

  it("앱: 메일 계정이 없으면(null) 숫자도 보고도 없다", async () => {
    window.benchClient = { mail: { openWindow: vi.fn(), unread: vi.fn().mockResolvedValue(null), onUnread: vi.fn(() => () => {}) } } as unknown as BenchClient;
    renderSidebar();
    await waitFor(() => expect(screen.getByRole("button", { name: "메일" })).toBeTruthy());
    expect(apiPut).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/안 읽은 메일/)).toBeNull();
  });

  it("브라우저: 서버가 아는 숫자만 보여 주고 메일 버튼은 없다", async () => {
    apiGet.mockImplementation((path: string) => Promise.resolve(path === "/api/mail/unread" ? { unread: 4 } : { count: 0 }));
    renderSidebar();
    expect(await screen.findByLabelText("안 읽은 메일 4통")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /메일/ })).toBeNull();
    expect(apiPut).not.toHaveBeenCalled(); // 브라우저는 서버에 알리지 않는다
  });

  it("브라우저: 서버가 모르면(null)·0통이면 아무것도 보이지 않는다", async () => {
    renderSidebar();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/api/mail/unread"));
    expect(screen.queryByText("안 읽은 메일")).toBeNull();
    apiGet.mockImplementation((path: string) => Promise.resolve(path === "/api/mail/unread" ? { unread: 0 } : { count: 0 }));
    cleanup();
    renderSidebar();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4));
    expect(screen.queryByText("안 읽은 메일")).toBeNull();
  });
});

describe("새 메일 알림 (사이드바)", () => {
  function installWithNewMail(unread: number | null = 3) {
    let push: (items: NewMailItem[]) => void = () => {};
    let pushUnread: (p: { unread: number }) => void = () => {};
    const openMessage = vi.fn().mockResolvedValue(undefined);
    window.benchClient = {
      mail: {
        openWindow: vi.fn(),
        unread: vi.fn().mockResolvedValue(unread),
        onUnread: vi.fn((cb: typeof pushUnread) => {
          pushUnread = cb;
          return () => {};
        }),
        onNewMail: vi.fn((cb: typeof push) => {
          push = cb;
          return () => {};
        }),
        openMessage,
      },
    } as unknown as BenchClient;
    return { openMessage, push: (items: Parameters<typeof push>[0]) => act(() => push(items)), pushUnread: (n: number) => act(() => pushUnread({ unread: n })) };
  }

  it("새 메일이 오면 [메일] 아래에 보낸 사람·제목이 나타난다 (이름 붙은 보낸 사람은 이름만)", async () => {
    const h = installWithNewMail();
    renderSidebar();
    await screen.findByLabelText("안 읽은 메일 3통");
    expect(screen.queryByRole("region", { name: "새 메일 알림" })).toBeNull();
    h.push([{ id: 7, from: "김영업 <kim@a.com>", subject: "견적서 송부" }]);
    const box = await screen.findByRole("region", { name: "새 메일 알림" });
    expect(within(box).getByText("김영업")).toBeTruthy();
    expect(within(box).getByText("견적서 송부")).toBeTruthy();
  });

  it("누르면 메일 창에서 그 메일을 열고 알림은 사라진다", async () => {
    const h = installWithNewMail();
    renderSidebar();
    await screen.findByLabelText("안 읽은 메일 3통");
    h.push([{ id: 7, from: "a@x.com", subject: "안녕" }]);
    fireEvent.click(await screen.findByRole("button", { name: "a@x.com 안녕" }));
    expect(h.openMessage).toHaveBeenCalledWith(7, undefined);
    await waitFor(() => expect(screen.queryByRole("region", { name: "새 메일 알림" })).toBeNull());
  });

  it("계정이 둘 이상이면 어느 계정으로 온 메일인지 보이고, 눌러 열 때 그 계정을 함께 알려 준다 (계정마다 메일 번호가 따로이므로)", async () => {
    const h = installWithNewMail();
    renderSidebar();
    await screen.findByLabelText("안 읽은 메일 3통");
    h.push([
      { id: 7, from: "a@x.com", subject: "안녕", accountId: "main", account: "me@bench.co.kr" },
      { id: 7, from: "b@x.com", subject: "반가워요", accountId: "a1b2c3", account: "work@gmail.com" },
    ]);
    expect(await screen.findByText("work@gmail.com")).toBeTruthy(); // 번호가 같아도 두 알림이 모두 보인다
    expect(screen.getByText("me@bench.co.kr")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /b@x.com 반가워요/ }));
    expect(h.openMessage).toHaveBeenCalledWith(7, "a1b2c3");
  });

  it("최근 3통만 최신 순으로 보이고, 하나씩 닫거나 모두 지울 수 있다", async () => {
    const h = installWithNewMail();
    renderSidebar();
    await screen.findByLabelText("안 읽은 메일 3통");
    for (const id of [1, 2, 3, 4]) h.push([{ id, from: `u${id}@x.com`, subject: `제목${id}` }]);
    const box = await screen.findByRole("region", { name: "새 메일 알림" });
    expect(within(box).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("제목4"), expect.stringContaining("제목3"), expect.stringContaining("제목2")]);
    h.push([{ id: 4, from: "u4@x.com", subject: "제목4" }]); // 같은 메일은 중복해서 쌓지 않는다
    expect(within(box).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(within(box).getByRole("button", { name: "u4@x.com 알림 닫기" }));
    expect(within(box).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(within(box).getByRole("button", { name: "모두 지우기" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "새 메일 알림" })).toBeNull());
  });

  it("안 읽은 메일이 0통이 되면 알림도 사라진다", async () => {
    const h = installWithNewMail();
    renderSidebar();
    await screen.findByLabelText("안 읽은 메일 3통");
    h.push([{ id: 1, from: "a@x.com", subject: "s" }]);
    await screen.findByRole("region", { name: "새 메일 알림" });
    h.pushUnread(0);
    await waitFor(() => expect(screen.queryByRole("region", { name: "새 메일 알림" })).toBeNull());
  });

  it("브라우저에는 알림이 없다", () => {
    renderSidebar();
    expect(screen.queryByRole("region", { name: "새 메일 알림" })).toBeNull();
  });
});
