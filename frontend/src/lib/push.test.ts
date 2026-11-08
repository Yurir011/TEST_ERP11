// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMobilePath } from "../features/mobile/mobilePaths";

const api = vi.hoisted(() => ({ apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock("./api", () => api);

import { isPushAvailable, listenPush, registerPush, unregisterPush } from "./push";

type Listener = (e: unknown) => void;

function installPlugin(over: Record<string, unknown> = {}) {
  const listeners: Record<string, Listener> = {};
  const plugin = {
    requestPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
    getToken: vi.fn().mockResolvedValue({ token: "t".repeat(40) }),
    deleteToken: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn((event: string, cb: Listener) => {
      listeners[event] = cb;
      return Promise.resolve({ remove: vi.fn().mockResolvedValue(undefined) });
    }),
    ...over,
  };
  (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { FirebaseMessaging: plugin }, getPlatform: () => "ios" };
  return { plugin, listeners };
}

beforeEach(() => {
  api.apiPost.mockReset().mockResolvedValue(undefined);
  api.apiDelete.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});
afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("푸시 등록", () => {
  it("앱이 아닌 브라우저에서는 아무 일도 하지 않는다", async () => {
    expect(isPushAvailable()).toBe(false);
    expect(await registerPush()).toBe(false);
    unregisterPush();
    expect(api.apiPost).not.toHaveBeenCalled();
    expect(api.apiDelete).not.toHaveBeenCalled();
  });

  it("권한을 받으면 토큰을 서버에 등록한다", async () => {
    const { plugin } = installPlugin();
    expect(await registerPush()).toBe(true);
    expect(plugin.requestPermissions).toHaveBeenCalled();
    expect(api.apiPost).toHaveBeenCalledWith("/api/push/devices", { token: "t".repeat(40), platform: "ios" });
  });

  it("권한을 거부하면 서버에 등록하지 않는다", async () => {
    installPlugin({ requestPermissions: vi.fn().mockResolvedValue({ receive: "denied" }) });
    expect(await registerPush()).toBe(false);
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("등록이 실패해도 예외를 내보내지 않는다", async () => {
    installPlugin();
    api.apiPost.mockRejectedValue(new Error("network"));
    expect(await registerPush()).toBe(false);
  });
});

describe("푸시 해제", () => {
  it("등록해 둔 토큰을 서버와 기기에서 지운다", async () => {
    const { plugin } = installPlugin();
    await registerPush();
    unregisterPush();
    expect(api.apiDelete).toHaveBeenCalledWith("/api/push/devices", { token: "t".repeat(40) }); // 첫 await 전에 동기적으로 요청한다
    expect(plugin.deleteToken).toHaveBeenCalled();
  });

  it("등록한 적이 없으면 서버에 요청하지 않는다", () => {
    installPlugin();
    unregisterPush();
    expect(api.apiDelete).not.toHaveBeenCalled();
  });
});

describe("알림 탭·토큰 갱신 듣기", () => {
  it("알림을 탭하면 data.link 를 넘긴다", () => {
    const { listeners } = installPlugin();
    const onTap = vi.fn();
    listenPush(onTap, () => true);
    listeners.notificationActionPerformed({ notification: { data: { link: "/documents?open=12" } } });
    listeners.notificationActionPerformed({ notification: { data: {} } });
    expect(onTap).toHaveBeenNthCalledWith(1, "/documents?open=12");
    expect(onTap).toHaveBeenNthCalledWith(2, null);
  });

  it("토큰이 바뀌면 로그인한 상태에서만 다시 등록한다", () => {
    const { listeners } = installPlugin();
    let loggedIn = false;
    listenPush(vi.fn(), () => loggedIn);
    listeners.tokenReceived({ token: "n".repeat(40) });
    expect(api.apiPost).not.toHaveBeenCalled();
    loggedIn = true;
    listeners.tokenReceived({ token: "n".repeat(40) });
    expect(api.apiPost).toHaveBeenCalledWith("/api/push/devices", { token: "n".repeat(40), platform: "ios" });
  });
});

describe("toMobilePath", () => {
  it("PC 경로를 모바일 경로로 바꾸고, 모르는 경로는 null", () => {
    expect(toMobilePath("/leaves?open=5")).toBe("/m/leaves");
    expect(toMobilePath("/documents?open=12")).toBe("/m/approvals");
    expect(toMobilePath("/proposals/3")).toBe("/m/approvals");
    expect(toMobilePath("/m/notices")).toBe("/m/notices");
    expect(toMobilePath("/clients")).toBeNull();
    expect(toMobilePath(null)).toBeNull();
  });
});
