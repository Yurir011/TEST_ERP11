// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { VersionLabel } from "../../components/layout/VersionLabel";
import type { BenchClient } from "../../lib/desktop";
import { useOpenConversationFromDesktop } from "../messenger/useOpenConversationFromDesktop";
import { DesktopUpdateNotice } from "./DesktopUpdateNotice";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), downloadFile: vi.fn() }));
vi.mock("../../lib/api", () => ({
  ...api,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const RELEASE = { version: "0.7.151", display: "V.0.07.151", filename: "BENCH-ERP_V.0.07.151_Setup.exe", size: 1234, notes: "메신저 개선", published_at: "2026-10-18T00:00:00Z" };

function installBench(appVersion: string) {
  let openCb: ((p: { conversationId: number }) => void) | null = null;
  const unsubscribed = vi.fn();
  window.benchClient = {
    getVersion: vi.fn().mockResolvedValue(appVersion),
    onOpenConversation: vi.fn((cb: (p: { conversationId: number }) => void) => {
      openCb = cb;
      return () => {
        openCb = null;
        unsubscribed();
      };
    }),
  } as unknown as BenchClient;
  return { open: (id: number) => act(() => openCb?.({ conversationId: id })), isListening: () => openCb !== null, unsubscribed };
}

function routeApi(opts: { latest?: unknown; health?: unknown }) {
  api.apiGet.mockImplementation(async (url: string) => {
    if (url === "/api/client/latest") {
      if (opts.latest instanceof Error) throw opts.latest;
      return opts.latest ?? null;
    }
    if (url === "/api/health") {
      if (opts.health instanceof Error) throw opts.health;
      return opts.health ?? {};
    }
    return null;
  });
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  delete window.benchClient;
});

const renderNotice = () =>
  render(
    <DialogProvider>
      <DesktopUpdateNotice />
    </DialogProvider>,
  );

describe("DesktopUpdateNotice (새 버전 안내)", () => {
  it("서버에 더 새 버전이 있으면 안내와 현재 버전, 바뀐 내용을 보여 준다", async () => {
    installBench("V.0.07.150");
    routeApi({ latest: RELEASE });
    renderNotice();
    expect(await screen.findByText(/새 버전 V\.0\.07\.151이 있습니다/)).toBeTruthy();
    expect(screen.getByText(/현재 V\.0\.07\.150/)).toBeTruthy();
    expect(screen.getByText("메신저 개선")).toBeTruthy();
  });

  it("같은 버전이거나 서버가 더 오래된 버전이면 아무것도 보이지 않는다", async () => {
    installBench("V.0.07.151");
    routeApi({ latest: RELEASE });
    const { container, unmount } = renderNotice();
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledWith("/api/client/latest"));
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toBe("");
    unmount();

    installBench("V.0.07.200");
    const again = renderNotice();
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });
    expect(again.container.textContent).toBe("");
  });

  it("서버에 올라온 설치 파일이 없거나(null), 확인에 실패하거나, 버전을 해석할 수 없으면 안내하지 않는다", async () => {
    installBench("V.0.07.150");
    for (const latest of [null, new Error("network"), { ...RELEASE, version: "latest" }]) {
      routeApi({ latest });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { container, unmount } = renderNotice();
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(container.textContent).toBe("");
      unmount();
    }
  });

  it("브라우저(앱이 아님)에서는 확인도 하지 않는다", async () => {
    routeApi({ latest: RELEASE });
    const { container } = renderNotice();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toBe("");
    expect(api.apiGet).not.toHaveBeenCalled();
  });

  it("[다운로드]는 설치 파일을 내려받고 설치 방법을 알려 준다", async () => {
    installBench("V.0.07.150");
    routeApi({ latest: RELEASE });
    api.downloadFile.mockResolvedValue(undefined);
    renderNotice();
    fireEvent.click(await screen.findByRole("button", { name: "다운로드" }));
    await waitFor(() => expect(api.downloadFile).toHaveBeenCalledWith("/api/client/download", "BENCH-ERP_V.0.07.151_Setup.exe"));
    expect(await screen.findByText(/앱을 종료.*파일을 실행하세요/)).toBeTruthy();
  });

  it("다운로드가 실패하면 안내하고 [다운로드]를 다시 누를 수 있다", async () => {
    installBench("V.0.07.150");
    routeApi({ latest: RELEASE });
    api.downloadFile.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderNotice();
    fireEvent.click(await screen.findByRole("button", { name: "다운로드" }));
    expect(await screen.findByText("설치 파일을 내려받지 못했습니다.")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "다운로드" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("[나중에]를 누르면 닫히고, 같은 버전은 이번 실행 동안 다시 묻지 않는다 (더 새 버전이 나오면 다시 안내)", async () => {
    installBench("V.0.07.150");
    routeApi({ latest: RELEASE });
    const first = renderNotice();
    fireEvent.click(await screen.findByLabelText("나중에"));
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();

    const second = renderNotice(); // 다른 메뉴로 이동해 화면이 새로 그려진 경우
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledTimes(2));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(second.container.textContent).toBe("");
    second.unmount();

    routeApi({ latest: { ...RELEASE, version: "0.7.152", display: "V.0.07.152" } });
    renderNotice();
    expect(await screen.findByText(/새 버전 V\.0\.07\.152이 있습니다/)).toBeTruthy();
  });
});

describe("VersionLabel (사이드바 버전 표시)", () => {
  it("서버 버전을 보여 준다", async () => {
    routeApi({ health: { version: "V.0.07.150" } });
    render(<VersionLabel />);
    expect(await screen.findByText("V.0.07.150")).toBeTruthy();
  });

  it("앱이 서버와 같은 버전이면 서버 버전만, 다르면 앱 버전도 함께 보여 준다", async () => {
    installBench("V.0.07.150");
    routeApi({ health: { version: "V.0.07.150" } });
    const first = render(<VersionLabel />);
    await screen.findByText("V.0.07.150");
    expect(screen.queryByText(/앱 V/)).toBeNull();
    first.unmount();

    installBench("V.0.07.149");
    render(<VersionLabel />);
    expect(await screen.findByText(/앱 V\.0\.07\.149/)).toBeTruthy();
  });

  it("서버 버전을 못 받으면 아무것도 보이지 않는다 (화면은 그대로 동작)", async () => {
    routeApi({ health: new Error("down") });
    const { container } = render(<VersionLabel />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.textContent).toBe("");
  });
});

describe("알림을 누르면 그 대화방으로 (useOpenConversationFromDesktop)", () => {
  function Where() {
    return <output data-testid="path">{useLocation().pathname}</output>;
  }
  function Host() {
    useOpenConversationFromDesktop();
    return <Where />;
  }
  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<Host />} />
        </Routes>
      </MemoryRouter>,
    );
  const path = () => screen.getByTestId("path").textContent;

  it("앱이 보낸 대화방 번호로 이동한다", () => {
    const bench = installBench("V.0.07.150");
    mount();
    bench.open(7);
    expect(path()).toBe("/messenger/7");
    bench.open(12);
    expect(path()).toBe("/messenger/12");
  });

  it("이상한 번호는 무시한다", () => {
    const bench = installBench("V.0.07.150");
    mount();
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_VALUE]) bench.open(bad);
    expect(path()).toBe("/");
  });

  it("화면이 사라지면 신호 받기를 멈추고, 앱이 아니면 아무 일도 없다", () => {
    const bench = installBench("V.0.07.150");
    const view = mount();
    expect(bench.isListening()).toBe(true);
    view.unmount();
    expect(bench.unsubscribed).toHaveBeenCalled();
    expect(bench.isListening()).toBe(false);

    delete window.benchClient;
    mount();
    expect(path()).toBe("/");
  });
});
