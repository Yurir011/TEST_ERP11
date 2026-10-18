// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BenchClient } from "../../lib/desktop";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { id: 1, name: "박소장", role: "admin", title: null, menu_permissions: [] }, logout: vi.fn() }) }));
vi.mock("../../features/todos/TodoPanel", () => ({ TodoPanel: () => null }));
vi.mock("./VersionLabel", () => ({ VersionLabel: () => null }));
vi.mock("../../lib/api", () => ({ apiGet: vi.fn().mockResolvedValue({ count: 0 }) }));

import { Sidebar } from "./Sidebar";

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
