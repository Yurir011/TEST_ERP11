// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchClient } from "../../lib/desktop";

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
