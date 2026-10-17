// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../context/useAuth";
import { MessengerProvider } from "./MessengerContext";
import type { DirectoryUser, RealtimeEvent } from "./types";
import { useMessenger, type MessengerContextValue } from "./useMessenger";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn() }));
vi.mock("../../lib/api", () => api);

// 실제 WebSocket 대신 시험용 연결: 테스트가 상태와 이벤트를 직접 보낸다
const fake = vi.hoisted(() => {
  class FakeClient {
    static instances: FakeClient[] = [];
    eventCbs = new Set<(e: unknown) => void>();
    statusCbs = new Set<(s: { state: string; epoch: number }) => void>();
    start() {}
    stop() {}
    onEvent(cb: (e: unknown) => void) { this.eventCbs.add(cb); return () => this.eventCbs.delete(cb); }
    onStatus(cb: (s: { state: string; epoch: number }) => void) { this.statusCbs.add(cb); return () => this.statusCbs.delete(cb); }
    emit(e: unknown) { this.eventCbs.forEach((cb) => cb(e)); }
    setStatus(s: { state: string; epoch: number }) { this.statusCbs.forEach((cb) => cb(s)); }
    constructor() { FakeClient.instances.push(this); }
  }
  return { FakeClient };
});
vi.mock("../../lib/realtime", () => ({ RealtimeClient: fake.FakeClient, realtimeUrl: () => "ws://test/api/ws" }));

const ME = 1;
const dirUser = (id: number, status: string, is_favorite = false): DirectoryUser => ({ id, name: `직원${id}`, grade: "staff", title: null, status, is_favorite });

let ctx: MessengerContextValue | null = null;
function Probe() {
  const c = useMessenger();
  useEffect(() => {
    ctx = c;
  });
  return (
    <output data-testid="dir">
      {c.directory === null ? "null" : c.directory.map((u) => `${u.id}:${u.status}:${u.is_favorite ? "fav" : "-"}`).join(",")}|{c.myStatus ?? "null"}
    </output>
  );
}
const state = () => screen.getByTestId("dir").textContent;

function auth(userId: number | null): AuthContextValue {
  return { user: userId === null ? null : ({ id: userId } as AuthContextValue["user"]), isLoading: false, login: vi.fn(), loginWithToken: vi.fn(), logout: vi.fn() };
}
function mount(userId: number | null = ME, children: ReactNode = <Probe />) {
  const ui = (id: number | null) => (
    <AuthContext.Provider value={auth(id)}>
      <MessengerProvider>{children}</MessengerProvider>
    </AuthContext.Provider>
  );
  const view = render(ui(userId));
  return { relogin: (id: number | null) => view.rerender(ui(id)) };
}
const client = () => fake.FakeClient.instances.at(-1)!;
const send = (e: RealtimeEvent) => act(() => client().emit(e));
const directoryCalls = () => api.apiGet.mock.calls.filter((c) => c[0] === "/api/messenger/directory").length;

function routeApi(directory: DirectoryUser[], status = "absent") {
  api.apiGet.mockImplementation(async (url: string) => {
    if (url === "/api/messenger/directory") return directory;
    if (url === "/api/messenger/status") return { status };
    return [];
  });
}
const ready = async () => {
  await waitFor(() => expect(fake.FakeClient.instances.length).toBeGreaterThan(0));
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  fake.FakeClient.instances.length = 0;
  ctx = null;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("전체 목록과 내 상태", () => {
  it("메신저 화면이 요청하기 전에는 불러오지 않고, 요청하면 목록과 내 상태를 함께 받는다", async () => {
    routeApi([dirUser(2, "working"), dirUser(3, "trip", true)], "meeting");
    mount();
    await ready();
    await act(async () => { await Promise.resolve(); });
    expect(directoryCalls()).toBe(0);
    expect(state()).toBe("null|null");

    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:working:-,3:trip:fav|meeting"));
  });

  it("다른 직원의 상태가 바뀌면 그 직원만 실시간으로 바뀌고, 내 상태가 바뀌면 내 값도 바뀐다 (출근 토글 포함)", async () => {
    routeApi([dirUser(2, "absent"), dirUser(3, "absent")], "absent");
    mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:absent:-,3:absent:-|absent"));

    send({ type: "presence.updated", user_id: 3, status: "trip" });
    await waitFor(() => expect(state()).toBe("2:absent:-,3:trip:-|absent"));
    send({ type: "presence.updated", user_id: ME, status: "working" }); // 출근 토글을 켜서 서버가 '출근'으로 바꿈
    await waitFor(() => expect(state()).toBe("2:absent:-,3:trip:-|working"));
    send({ type: "presence.updated", user_id: 99, status: "leave" }); // 목록에 없는 직원은 무시
    await waitFor(() => expect(state()).toBe("2:absent:-,3:trip:-|working"));
  });

  it("전체 목록을 쓰고 있지 않으면 상태 알림을 반영하지 않는다", async () => {
    routeApi([dirUser(2, "absent")]);
    mount();
    await ready();
    send({ type: "presence.updated", user_id: ME, status: "working" });
    await act(async () => { await Promise.resolve(); });
    expect(state()).toBe("null|null");
    expect(directoryCalls()).toBe(0);
  });

  it("즐겨찾기가 다른 창에서 바뀌면 목록을 다시 받는다", async () => {
    routeApi([dirUser(2, "absent")]);
    mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:absent:-|absent"));
    routeApi([dirUser(2, "absent", true)]);
    send({ type: "favorites.updated" });
    await waitFor(() => expect(state()).toBe("2:absent:fav|absent"));
  });

  it("다시 연결되거나 창을 다시 볼 때 최신으로 받는다 (요청했을 때만)", async () => {
    routeApi([dirUser(2, "absent")]);
    mount();
    await ready();
    act(() => client().setStatus({ state: "connected", epoch: 1 }));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => { await Promise.resolve(); });
    expect(directoryCalls()).toBe(0); // 아직 요청 전

    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(directoryCalls()).toBe(1));
    routeApi([dirUser(2, "outside")], "meal");
    act(() => client().setStatus({ state: "connected", epoch: 2 }));
    await waitFor(() => expect(state()).toBe("2:outside:-|meal"));
    routeApi([dirUser(2, "leave")], "leave");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(state()).toBe("2:leave:-|leave"));
  });

  it("내 상태 변경: 화면에 바로 반영하고 서버에 저장한다", async () => {
    routeApi([dirUser(2, "absent")], "working");
    api.apiPut.mockResolvedValue({});
    mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:absent:-|working"));
    await act(async () => {
      await ctx!.changeMyStatus("outside");
    });
    expect(state()).toBe("2:absent:-|outside");
    expect(api.apiPut).toHaveBeenCalledWith("/api/messenger/status", { status: "outside" });
  });

  it("내 상태 변경을 서버가 받지 않으면 이전 상태로 되돌리고 오류를 알린다", async () => {
    routeApi([dirUser(2, "absent")], "working");
    api.apiPut.mockRejectedValue(new Error("422"));
    mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:absent:-|working"));
    await act(async () => {
      await expect(ctx!.changeMyStatus("meal")).rejects.toThrow("422");
    });
    expect(state()).toBe("2:absent:-|working");
  });

  it("즐겨찾기 추가·해제: 바로 반영하고 서버에 저장한다", async () => {
    routeApi([dirUser(2, "absent")]);
    api.apiPut.mockResolvedValue({});
    api.apiDelete.mockResolvedValue({});
    mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:absent:-|absent"));
    await act(async () => {
      await ctx!.toggleFavorite(2, true);
    });
    expect(state()).toBe("2:absent:fav|absent");
    expect(api.apiPut).toHaveBeenCalledWith("/api/messenger/favorites/2");
    await act(async () => {
      await ctx!.toggleFavorite(2, false);
    });
    expect(state()).toBe("2:absent:-|absent");
    expect(api.apiDelete).toHaveBeenCalledWith("/api/messenger/favorites/2");
  });

  it("즐겨찾기 저장이 실패하면 체크를 되돌리고 오류를 알린다", async () => {
    routeApi([dirUser(2, "absent", true)]);
    api.apiDelete.mockRejectedValue(new Error("network"));
    mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:absent:fav|absent"));
    await act(async () => {
      await expect(ctx!.toggleFavorite(2, false)).rejects.toThrow("network");
    });
    expect(state()).toBe("2:absent:fav|absent");
  });

  it("로그아웃하면 직원 목록·내 상태를 지운다 (다음 사람에게 남지 않게)", async () => {
    routeApi([dirUser(2, "trip", true)], "meeting");
    const { relogin } = mount();
    await ready();
    act(() => ctx!.ensureDirectory());
    await waitFor(() => expect(state()).toBe("2:trip:fav|meeting"));
    relogin(null);
    await waitFor(() => expect(state()).toBe("null|null"));
    relogin(7); // 다른 사람이 로그인
    await waitFor(() => expect(fake.FakeClient.instances).toHaveLength(2));
    send({ type: "presence.updated", user_id: 2, status: "off" }); // 아직 요청 전이므로 반영하지 않는다
    await act(async () => { await Promise.resolve(); });
    expect(state()).toBe("null|null");
  });
});
