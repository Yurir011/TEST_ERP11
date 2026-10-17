// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchClient, NfcLoginResult, NfcMode, NfcReaderStatus } from "../../lib/desktop";
import { resolveNfcMode, useNfcMode } from "../../lib/nfcMode";
import { NfcLoginPanel } from "./NfcLoginPanel";

afterEach(() => {
  cleanup();
  delete window.benchClient;
});

/** 데스크톱 앱이 화면에 넣어 주는 benchClient 흉내: 앱에 알린 모드 기록과, 로그인 결과·리더 상태를 앱 대신 보내는 함수 */
function installBench(status: NfcReaderStatus) {
  const modes: NfcMode[] = [];
  let loginCb: ((r: NfcLoginResult) => void) | null = null;
  let statusCb: ((s: NfcReaderStatus) => void) | null = null;
  window.benchClient = {
    nfc: {
      status: vi.fn().mockResolvedValue(status),
      onStatus: vi.fn((cb) => { statusCb = cb; return () => { statusCb = null; }; }),
      setMode: vi.fn(async (m: NfcMode) => { modes.push(m); }),
      onCard: vi.fn(() => () => {}),
      onLogin: vi.fn((cb) => { loginCb = cb; return () => { loginCb = null; }; }),
    },
  } as unknown as BenchClient;
  return {
    modes,
    sendLogin: (r: NfcLoginResult) => act(() => loginCb?.(r)),
    sendStatus: (s: NfcReaderStatus) => act(() => statusCb?.(s)),
  };
}

describe("resolveNfcMode", () => {
  it("카드 등록 > 로그인 > 없음 순으로 고른다", () => {
    expect(resolveNfcMode([])).toBe("off");
    expect(resolveNfcMode(["login"])).toBe("login");
    expect(resolveNfcMode(["capture"])).toBe("capture");
    expect(resolveNfcMode(["login", "capture"])).toBe("capture");
    expect(resolveNfcMode(["capture", "login", "off"])).toBe("capture");
  });
});

describe("NfcLoginPanel", () => {
  it("브라우저(앱이 아님)에서는 아무것도 보이지 않는다", () => {
    const { container } = render(<NfcLoginPanel onToken={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("앱에서는 로그인 모드를 요청하고, 화면이 사라지면 해제한다", async () => {
    const { modes } = installBench({ state: "ready", port: "COM3" });
    const { unmount } = render(<NfcLoginPanel onToken={vi.fn()} />);
    expect(await screen.findByText(/리더에 대면 바로 로그인/)).toBeTruthy();
    await waitFor(() => expect(modes.at(-1)).toBe("login"));
    unmount();
    await waitFor(() => expect(modes.at(-1)).toBe("off"));
  });

  it("리더가 준비되지 않았으면 이유를 알린다", async () => {
    installBench({ state: "busy" });
    render(<NfcLoginPanel onToken={vi.fn()} />);
    expect(await screen.findByText(/다른 프로그램이 리더를 사용 중/)).toBeTruthy();
    expect(screen.getByText(/카드 로그인을 쓸 수 없습니다/)).toBeTruthy();
  });

  it("리더 상태가 바뀌면 안내도 바뀐다", async () => {
    const { sendStatus } = installBench({ state: "searching" });
    render(<NfcLoginPanel onToken={vi.fn()} />);
    expect(await screen.findByText(/리더를 찾는 중/)).toBeTruthy();
    sendStatus({ state: "ready" });
    expect(await screen.findByText(/리더에 대면 바로 로그인/)).toBeTruthy();
  });

  it("로그인 결과(토큰)를 받으면 그 토큰으로 로그인한다", async () => {
    const { sendLogin } = installBench({ state: "ready" });
    const onToken = vi.fn().mockResolvedValue(undefined);
    render(<NfcLoginPanel onToken={onToken} />);
    await screen.findByText(/리더에 대면 바로 로그인/);
    sendLogin({ ok: true, token: "tok-abc" });
    await waitFor(() => expect(onToken).toHaveBeenCalledWith("tok-abc"));
  });

  it("서버가 거절하면 그 문구를 보여 주고 로그인하지 않는다", async () => {
    const { sendLogin } = installBench({ state: "ready" });
    const onToken = vi.fn();
    render(<NfcLoginPanel onToken={onToken} />);
    await screen.findByText(/리더에 대면 바로 로그인/);
    sendLogin({ ok: false, error: "등록되지 않았거나 사용할 수 없는 카드입니다." });
    expect((await screen.findByRole("alert")).textContent).toBe("등록되지 않았거나 사용할 수 없는 카드입니다.");
    expect(onToken).not.toHaveBeenCalled();
  });

  it("토큰을 확인하지 못하면(서버가 거절) 다시 대라고 안내", async () => {
    const { sendLogin } = installBench({ state: "ready" });
    render(<NfcLoginPanel onToken={vi.fn().mockRejectedValue(new Error("401"))} />);
    await screen.findByText(/리더에 대면 바로 로그인/);
    sendLogin({ ok: true, token: "bad" });
    expect((await screen.findByRole("alert")).textContent).toMatch(/다시 대세요/);
  });
});

describe("useNfcMode 우선순위", () => {
  function Probe({ mode, enabled }: { mode: "login" | "capture"; enabled: boolean }) {
    useNfcMode(mode, enabled);
    return null;
  }
  beforeEach(() => cleanup());

  it("등록 중(capture)에는 로그인(login) 요청이 있어도 capture, 끝나면 login 으로 돌아온다", async () => {
    const { modes } = installBench({ state: "ready" });
    const login = render(<Probe mode="login" enabled />);
    await waitFor(() => expect(modes.at(-1)).toBe("login"));

    const capture = render(<Probe mode="capture" enabled />);
    await waitFor(() => expect(modes.at(-1)).toBe("capture"));
    capture.unmount();
    await waitFor(() => expect(modes.at(-1)).toBe("login"));
    login.unmount();
    await waitFor(() => expect(modes.at(-1)).toBe("off"));
  });

  it("enabled 가 false 이면 요청하지 않는다", async () => {
    const { modes } = installBench({ state: "ready" });
    render(<Probe mode="capture" enabled={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(modes).toEqual([]);
  });
});
