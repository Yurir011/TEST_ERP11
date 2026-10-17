// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../context/useAuth";
import type { BenchClient } from "../../lib/desktop";
import type { ConnectionStatus } from "../../lib/realtime";
import { MessengerProvider } from "./MessengerContext";
import type { ChatMessage, ConversationSummary, RealtimeEvent } from "./types";
import { useMessenger, type MessengerContextValue } from "./useMessenger";

const api = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("../../lib/api", () => api);

// 실제 WebSocket 대신 시험용 연결: 테스트가 상태와 이벤트를 직접 보낸다
const fake = vi.hoisted(() => {
  class FakeClient {
    static instances: FakeClient[] = [];
    started = false;
    stopped = false;
    status = { state: "disconnected", epoch: 0 };
    eventCbs = new Set<(e: unknown) => void>();
    statusCbs = new Set<(s: { state: string; epoch: number }) => void>();
    opts: { url: string };
    constructor(opts: { url: string }) {
      this.opts = opts;
      FakeClient.instances.push(this);
    }
    start() { this.started = true; }
    stop() { this.stopped = true; }
    onEvent(cb: (e: unknown) => void) { this.eventCbs.add(cb); return () => this.eventCbs.delete(cb); }
    onStatus(cb: (s: { state: string; epoch: number }) => void) { this.statusCbs.add(cb); return () => this.statusCbs.delete(cb); }
    emit(e: unknown) { this.eventCbs.forEach((cb) => cb(e)); }
    setStatus(s: { state: string; epoch: number }) { this.status = s; this.statusCbs.forEach((cb) => cb(s)); }
  }
  return { FakeClient };
});
vi.mock("../../lib/realtime", () => ({ RealtimeClient: fake.FakeClient, realtimeUrl: () => "ws://test/api/ws" }));

const ME = 1;

const conv = (id: number, over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id, kind: "direct", title: `상대${id}`, members: [{ id: ME, name: "나", last_read_message_id: null }, { id: 2, name: "김영희", last_read_message_id: null }],
  last_message: null, unread_count: 0, muted: false, created_at: "2026-10-01T00:00:00Z", last_message_at: null, ...over,
});
const msg = (id: number, conversationId: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversation_id: conversationId, sender_id: 2, sender_name: "김영희", body: `메시지 ${id}`, created_at: "2026-10-17T10:00:00Z", client_msg_id: null, attachments: [], ...over,
});

let ctx: MessengerContextValue | null = null;
function Grab() {
  const c = useMessenger();
  useEffect(() => {
    ctx = c;
  });
  return (
    <output data-testid="state">
      {c.conversations === null ? "null" : c.conversations.map((x) => `${x.id}:${x.unread_count}`).join(",")}|{c.unreadTotal}
    </output>
  );
}

function auth(userId: number | null): AuthContextValue {
  return { user: userId === null ? null : ({ id: userId } as AuthContextValue["user"]), isLoading: false, login: vi.fn(), loginWithToken: vi.fn(), logout: vi.fn() };
}

function mount(userId: number | null = ME, children: ReactNode = <Grab />) {
  const ui = (id: number | null) => (
    <AuthContext.Provider value={auth(id)}>
      <MessengerProvider>{children}</MessengerProvider>
    </AuthContext.Provider>
  );
  const view = render(ui(userId));
  return { view, relogin: (id: number | null) => view.rerender(ui(id)) };
}

const client = () => fake.FakeClient.instances.at(-1)!;
const send = (e: RealtimeEvent) => act(() => client().emit(e));
const state = () => screen.getByTestId("state").textContent;

let bench: { notify: ReturnType<typeof vi.fn>; setBadge: ReturnType<typeof vi.fn> };
let viewing = false;

beforeEach(() => {
  api.apiGet.mockReset();
  fake.FakeClient.instances.length = 0;
  ctx = null;
  bench = { notify: vi.fn().mockResolvedValue(undefined), setBadge: vi.fn().mockResolvedValue(undefined) };
  window.benchClient = bench as unknown as BenchClient;
  viewing = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.spyOn(document, "hasFocus").mockImplementation(() => viewing);
  api.apiGet.mockResolvedValue([conv(10), conv(11)]);
});
afterEach(() => {
  cleanup();
  delete window.benchClient;
  document.title = "";
  vi.restoreAllMocks();
});

describe("MessengerProvider", () => {
  it("로그인하면 목록을 받고 실시간 연결을 시작한다 (주소 그대로)", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    expect(client().started).toBe(true);
    expect(client().opts.url).toBe("ws://test/api/ws");
    expect(api.apiGet).toHaveBeenCalledWith("/api/messenger/conversations");
  });

  it("로그인하지 않았으면 연결도 요청도 하지 않는다", async () => {
    mount(null);
    expect(screen.getByTestId("state").textContent).toBe("null|0");
    expect(fake.FakeClient.instances).toHaveLength(0);
    expect(api.apiGet).not.toHaveBeenCalled();
  });

  it("로그아웃하면 연결을 닫고 이전 사람의 목록을 지운다", async () => {
    const { relogin } = mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    const first = client();
    relogin(null);
    expect(first.stopped).toBe(true);
    await waitFor(() => expect(state()).toBe("null|0"));
  });

  it("(다시) 연결되면 목록을 다시 받는다", async () => {
    mount();
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledTimes(1));
    api.apiGet.mockResolvedValue([conv(10, { unread_count: 4 }), conv(11)]);
    act(() => client().setStatus({ state: "connected", epoch: 1 }));
    await waitFor(() => expect(state()).toBe("10:4,11:0|4"));
  });

  it("연결 상태를 알려 준다", async () => {
    let seen: ConnectionStatus | null = null;
    function Conn() {
      const c = useMessenger();
      useEffect(() => {
        seen = c.connection;
      });
      return null;
    }
    mount(ME, <Conn />);
    await waitFor(() => expect(fake.FakeClient.instances).toHaveLength(1));
    act(() => client().setStatus({ state: "connected", epoch: 3 }));
    await waitFor(() => expect(seen).toEqual({ state: "connected", epoch: 3 }));
  });
});

describe("새 메시지 반영과 알림", () => {
  it("남이 보낸 메시지: 안 읽은 수가 늘고 그 대화방이 맨 위로 오며 데스크톱 알림이 뜬다", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    send({ type: "message.created", message: msg(5, 11, { body: "안녕하세요" }) });
    await waitFor(() => expect(state()).toBe("11:1,10:0|1"));
    expect(bench.notify).toHaveBeenCalledWith("김영희", "안녕하세요", 11); // 알림을 누르면 이 대화방(11)으로
  });

  it("그룹은 '대화방 이름 · 보낸 사람'으로 알리고, 파일이면 파일 이름", async () => {
    api.apiGet.mockResolvedValue([conv(10, { kind: "group", title: "프로젝트방" })]);
    mount();
    await waitFor(() => expect(state()).toBe("10:0|0"));
    send({ type: "message.created", message: msg(5, 10, { body: "", attachments: [{ id: 1, file_name: "견적서.pdf", size: 1, content_type: "application/pdf" }] }) });
    await waitFor(() => expect(bench.notify).toHaveBeenCalledWith("프로젝트방 · 김영희", "[파일] 견적서.pdf", 10));
  });

  it("내가 보낸 메시지는 안 읽음으로 세지 않고 알림도 없다", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    send({ type: "message.created", message: msg(5, 10, { sender_id: ME, sender_name: "나" }) });
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    expect(bench.notify).not.toHaveBeenCalled();
  });

  it("알림을 끈 대화방은 안 읽은 수는 늘지만 알림은 없다", async () => {
    api.apiGet.mockResolvedValue([conv(10, { muted: true })]);
    mount();
    await waitFor(() => expect(state()).toBe("10:0|0"));
    send({ type: "message.created", message: msg(5, 10) });
    await waitFor(() => expect(state()).toBe("10:1|1"));
    expect(bench.notify).not.toHaveBeenCalled();
  });

  it("지금 보고 있는 대화방의 메시지는 안 읽음으로 세지 않고 알림도 없다 (창을 보고 있지 않으면 알림)", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    act(() => ctx!.setActiveConversation(10));

    viewing = true;
    send({ type: "message.created", message: msg(5, 10) });
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    expect(bench.notify).not.toHaveBeenCalled();

    viewing = false; // 다른 창을 보고 있다
    send({ type: "message.created", message: msg(6, 10) });
    await waitFor(() => expect(state()).toBe("10:1,11:0|1"));
    expect(bench.notify).toHaveBeenCalledTimes(1);
  });

  it("같은 메시지가 두 번 와도 안 읽은 수도 알림도 한 번만", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    send({ type: "message.created", message: msg(5, 10) });
    send({ type: "message.created", message: msg(5, 10) });
    await waitFor(() => expect(state()).toBe("10:1,11:0|1"));
    expect(bench.notify).toHaveBeenCalledTimes(1); // 알림도 한 번만
  });

  it("모르는 대화방의 메시지가 오면 목록을 다시 받는다", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    api.apiGet.mockResolvedValue([conv(12, { unread_count: 1 }), conv(10), conv(11)]);
    send({ type: "message.created", message: msg(9, 12) });
    await waitFor(() => expect(state()).toBe("12:1,10:0,11:0|1"));
  });

  it("내가 다른 창에서 마지막 메시지까지 읽으면 안 읽은 수가 0 이 된다", async () => {
    api.apiGet.mockResolvedValue([conv(10, { unread_count: 2, last_message: { id: 7, sender_id: 2, sender_name: "김영희", preview: "", has_attachment: false, created_at: "2026-10-17T10:00:00Z" } })]);
    mount();
    await waitFor(() => expect(state()).toBe("10:2|2"));
    send({ type: "conversation.read", conversation_id: 10, user_id: ME, message_id: 7 });
    await waitFor(() => expect(state()).toBe("10:0|0"));
  });

  it("대화방이 바뀌었다는 알림(참여자 추가, 새 대화 등)이 오면 목록을 다시 받는다", async () => {
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    api.apiGet.mockResolvedValue([conv(10)]);
    send({ type: "conversation.updated", conversation_id: 11 });
    await waitFor(() => expect(state()).toBe("10:0|0"));
  });

  it("이벤트를 구독할 수 있고 해제하면 더 받지 않는다", async () => {
    mount();
    await waitFor(() => expect(ctx).not.toBeNull());
    const got: RealtimeEvent[] = [];
    const off = ctx!.subscribe((e) => got.push(e));
    send({ type: "conversation.updated", conversation_id: 10 });
    off();
    send({ type: "conversation.updated", conversation_id: 11 });
    expect(got).toHaveLength(1);
  });
});

describe("앱 배지와 창 제목", () => {
  it("안 읽은 수를 앱 배지와 창 제목에 표시하고, 0 이면 원래대로", async () => {
    mount();
    await waitFor(() => expect(bench.setBadge).toHaveBeenCalledWith(0));
    expect(document.title).toBe("BENCH ERP");
    send({ type: "message.created", message: msg(5, 10) });
    send({ type: "message.created", message: msg(6, 10) });
    await waitFor(() => expect(bench.setBadge).toHaveBeenLastCalledWith(2));
    expect(document.title).toBe("(2) BENCH ERP");
  });

  it("앱이 아닌 브라우저에서도 창 제목은 바뀐다 (오류 없이)", async () => {
    delete window.benchClient;
    mount();
    await waitFor(() => expect(state()).toBe("10:0,11:0|0"));
    send({ type: "message.created", message: msg(5, 10) });
    await waitFor(() => expect(document.title).toBe("(1) BENCH ERP"));
  });
});
