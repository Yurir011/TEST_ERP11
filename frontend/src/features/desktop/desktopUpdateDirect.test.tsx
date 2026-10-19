// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import type { BenchClient, UpdateBridge, UpdateCheck } from "../../lib/desktop";
import { DesktopUpdateNotice, RECHECK_MS } from "./DesktopUpdateNotice";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), downloadFile: vi.fn() }));
vi.mock("../../lib/api", () => ({
  ...api,
  ApiError: class ApiError extends Error {},
}));

const LATEST = { version: "0.71.7", display: "V.0.71.007", filename: "BENCH-ERP_Setup_0.71.007.exe", size: 113_000_000 };
const NEWER: UpdateCheck = { ok: true, latest: LATEST, current: "0.71.6", newer: true };

let progressCb: ((p: { ratio: number }) => void) | null = null;

function installBench(over: Partial<UpdateBridge> = {}) {
  const update: UpdateBridge = {
    check: vi.fn().mockResolvedValue(NEWER),
    install: vi.fn().mockResolvedValue({ ok: true, value: { display: LATEST.display } }),
    onProgress: vi.fn((cb: (p: { ratio: number }) => void) => {
      progressCb = cb;
      return () => {
        progressCb = null;
      };
    }),
    ...over,
  };
  window.benchClient = { getVersion: vi.fn().mockResolvedValue("0.71.6"), update } as unknown as BenchClient;
  return update;
}

const renderNotice = () =>
  render(
    <DialogProvider>
      <DesktopUpdateNotice />
    </DialogProvider>,
  );

/** 배너의 버튼을 누르면 같은 이름의 확인 버튼이 확인 창에 하나 더 생긴다 → 그 마지막 버튼을 누른다 */
async function confirmUpdate() {
  fireEvent.click(await screen.findByRole("button", { name: "지금 업데이트" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "지금 업데이트" })).toHaveLength(2));
  fireEvent.click(screen.getAllByRole("button", { name: "지금 업데이트" }).at(-1)!);
}

beforeEach(() => {
  api.apiGet.mockReset();
  api.downloadFile.mockReset();
  sessionStorage.clear();
  progressCb = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.benchClient;
});

describe("바로 업데이트 (앱이 업데이트를 지원할 때)", () => {
  it("새 버전이 있으면 [지금 업데이트]를 보여 주고, 서버에 직접 묻지 않고 앱에 묻는다", async () => {
    installBench();
    renderNotice();
    expect(await screen.findByText(/새 버전 V\.0\.71\.007이 있습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "지금 업데이트" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다운로드" })).toBeNull();
    expect(api.apiGet).not.toHaveBeenCalled();
  });

  it("최신이거나 확인에 실패하면 아무것도 보이지 않는다", async () => {
    installBench({ check: vi.fn().mockResolvedValue({ ok: true, latest: LATEST, current: "0.71.7", newer: false }) });
    const a = renderNotice();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(a.container.textContent).toBe("");
    a.unmount();
    installBench({ check: vi.fn().mockResolvedValue({ ok: false, error: "서버에서 새 버전 정보를 받지 못했습니다." }) });
    const b = renderNotice();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(b.container.textContent).toBe("");
  });

  it("누르면 먼저 확인을 받고, 확인하면 업데이트를 시작해 진행률과 설치 중 안내를 보여 준다", async () => {
    let finish: (v: { ok: true; value: { display: string } }) => void = () => {};
    const install = vi.fn().mockReturnValue(new Promise((r) => (finish = r)));
    installBench({ install });
    renderNotice();
    fireEvent.click(await screen.findByRole("button", { name: "지금 업데이트" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "지금 업데이트" })).toHaveLength(2));
    expect(install).not.toHaveBeenCalled(); // 확인 창이 먼저
    fireEvent.click(screen.getAllByRole("button", { name: "지금 업데이트" }).at(-1)!);
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(progressCb).toBeTruthy());
    act(() => progressCb?.({ ratio: 0.42 }));
    expect(await screen.findByText(/새 버전을 받는 중\.\.\. 42%/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "받는 중..." }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "나중에" })).toBeNull(); // 진행 중에는 닫을 수 없다
    await act(async () => finish({ ok: true, value: { display: LATEST.display } }));
    expect(await screen.findByText(/설치 중입니다/)).toBeTruthy();
  });

  it("확인 창에서 취소하면 아무 일도 하지 않는다", async () => {
    const update = installBench();
    renderNotice();
    fireEvent.click(await screen.findByRole("button", { name: "지금 업데이트" }));
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(update.install).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "지금 업데이트" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("업데이트가 거절되면 이유를 알리고 다시 누를 수 있다", async () => {
    installBench({ install: vi.fn().mockResolvedValue({ ok: false, error: "받은 파일이 서버의 파일과 다릅니다(손상). 다시 시도해 주세요." }) });
    renderNotice();
    await confirmUpdate();
    expect(await screen.findByText(/서버의 파일과 다릅니다/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "지금 업데이트" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/설치 중입니다/)).toBeNull();
  });

  it("앱을 켜 둔 동안 1시간마다 다시 확인한다", async () => {
    vi.useFakeTimers();
    const update = installBench({ check: vi.fn().mockResolvedValue({ ok: true, latest: LATEST, current: "0.71.7", newer: false }) });
    renderNotice();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(update.check).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(RECHECK_MS); });
    expect(update.check).toHaveBeenCalledTimes(2);
  });
});
