import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient, realtimeUrl, type ConnectionStatus, type SocketLike } from "./realtime";

class FakeSocket implements SocketLike {
  sent: unknown[] = [];
  closed: number | null | undefined = undefined;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close(code?: number) { this.closed = code ?? null; queueMicrotask(() => this.onclose?.({ code: code ?? 1006 })); }
  // 서버 쪽 동작 흉내
  open() { this.onopen?.(); }
  receive(obj: unknown) { this.onmessage?.({ data: typeof obj === "string" ? obj : JSON.stringify(obj) }); }
  drop(code = 1006) { this.onclose?.({ code }); }
}

function setup(token: string | null = "tok") {
  const sockets: FakeSocket[] = [];
  const client = new RealtimeClient<{ type: string; n?: number }>({
    url: "ws://x/api/ws",
    getToken: () => token,
    createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    backoffMs: [1000, 2000, 5000, 10000],
    pingMs: 30_000,
    pongTimeoutMs: 10_000,
  });
  const statuses: ConnectionStatus[] = [];
  client.onStatus((s) => statuses.push(s));
  return { client, sockets, statuses };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("realtimeUrl", () => {
  it("http 는 ws, https 는 wss", () => {
    expect(realtimeUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/api/ws");
    expect(realtimeUrl({ protocol: "https:", host: "erp.bench.co.kr" })).toBe("wss://erp.bench.co.kr/api/ws");
  });
});

describe("RealtimeClient", () => {
  it("열리면 첫 메시지로 토큰을 보내고, ready 를 받으면 연결됨 (토큰은 주소에 없다)", () => {
    const { client, sockets, statuses } = setup();
    client.start();
    expect(statuses.at(-1)).toEqual({ state: "connecting", epoch: 0 });
    sockets[0].open();
    expect(sockets[0].sent).toEqual([{ type: "auth", token: "tok" }]);
    sockets[0].receive({ type: "ready" });
    expect(statuses.at(-1)).toEqual({ state: "connected", epoch: 1 });
  });

  it("서버 이벤트를 구독자에게 전달하고, 형식이 이상한 것은 무시한다", () => {
    const { client, sockets } = setup();
    const got: unknown[] = [];
    client.onEvent((e) => got.push(e));
    client.start();
    sockets[0].open();
    sockets[0].receive({ type: "ready" });
    sockets[0].receive({ type: "message.created", n: 1 });
    sockets[0].receive("not json");
    sockets[0].receive([1, 2]);
    sockets[0].receive({ nope: true });
    sockets[0].receive({ type: "pong" }); // pong 은 이벤트가 아니다
    expect(got).toEqual([{ type: "message.created", n: 1 }]);
  });

  it("한 구독자가 오류를 내도 다른 구독자는 받는다", () => {
    const { client, sockets } = setup();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const got: unknown[] = [];
    client.onEvent(() => { throw new Error("boom"); });
    client.onEvent((e) => got.push(e));
    client.start();
    sockets[0].open();
    sockets[0].receive({ type: "x" });
    expect(got).toHaveLength(1);
    err.mockRestore();
  });

  it("끊기면 1 → 2 → 5 → 10 → 10초 간격으로 다시 연결하고, 성공하면 처음 간격으로 돌아간다", () => {
    const { client, sockets } = setup();
    client.start();
    const expectedDelays = [1000, 2000, 5000, 10000, 10000];
    for (const [i, delay] of expectedDelays.entries()) {
      sockets[i].drop();
      vi.advanceTimersByTime(delay - 1);
      expect(sockets).toHaveLength(i + 1); // 아직 다시 연결하지 않았다
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(i + 2);
    }
    const last = sockets.at(-1)!;
    last.open();
    last.receive({ type: "ready" });
    last.drop();
    vi.advanceTimersByTime(1000); // 성공했으니 다시 1초부터
    expect(sockets).toHaveLength(expectedDelays.length + 2);
  });

  it("다시 연결될 때마다 epoch 가 늘어난다 (화면이 놓친 것을 다시 받는 신호)", () => {
    const { client, sockets, statuses } = setup();
    client.start();
    sockets[0].open();
    sockets[0].receive({ type: "ready" });
    sockets[0].drop();
    vi.advanceTimersByTime(1000);
    sockets[1].open();
    sockets[1].receive({ type: "ready" });
    expect(statuses.filter((s) => s.state === "connected").map((s) => s.epoch)).toEqual([1, 2]);
  });

  it("인증 실패(4401)로 끊기면 60초 뒤에 다시 시도한다", () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].drop(4401);
    vi.advanceTimersByTime(59_999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
  });

  it("다시 연결할 때마다 그 시점의 토큰을 쓴다 (로그인이 바뀌어도 이전 토큰을 보내지 않는다)", () => {
    let token: string | null = "old";
    const sockets: FakeSocket[] = [];
    const client = new RealtimeClient({ url: "u", getToken: () => token, createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; } });
    client.start();
    sockets[0].open();
    token = "new";
    sockets[0].drop();
    vi.advanceTimersByTime(1000);
    sockets[1].open();
    expect(sockets[0].sent).toEqual([{ type: "auth", token: "old" }]);
    expect(sockets[1].sent).toEqual([{ type: "auth", token: "new" }]);
  });

  it("토큰이 없으면 연결하지 않고 기다린다", () => {
    const { client, sockets } = setup(null);
    client.start();
    expect(sockets).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(0);
    client.stop();
  });

  it("30초마다 ping 을 보내고, 응답이 없으면 끊고 다시 연결한다", async () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].open();
    sockets[0].receive({ type: "ready" });
    vi.advanceTimersByTime(30_000);
    expect(sockets[0].sent.at(-1)).toEqual({ type: "ping" });
    await vi.advanceTimersByTimeAsync(10_000); // pong 이 오지 않음
    expect(sockets[0].closed).toBe(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
  });

  it("pong 이 오면 끊지 않는다", () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].open();
    sockets[0].receive({ type: "ready" });
    vi.advanceTimersByTime(30_000);
    sockets[0].receive({ type: "pong" });
    vi.advanceTimersByTime(20_000);
    expect(sockets[0].closed).toBe(undefined);
    expect(sockets).toHaveLength(1);
  });

  it("stop 하면 닫고 더 이상 다시 연결하지 않는다 (남은 이벤트도 무시)", () => {
    const { client, sockets, statuses } = setup();
    const got: unknown[] = [];
    client.onEvent((e) => got.push(e));
    client.start();
    sockets[0].open();
    sockets[0].receive({ type: "ready" });
    client.stop();
    expect(sockets[0].closed).toBe(1000);
    sockets[0].receive({ type: "late" });
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(got).toEqual([]);
    expect(statuses.at(-1)?.state).toBe("disconnected");
  });

  it("start 를 두 번 불러도 연결은 하나", () => {
    const { client, sockets } = setup();
    client.start();
    client.start();
    expect(sockets).toHaveLength(1);
  });

  it("옛 연결에서 늦게 온 메시지·닫힘은 새 연결에 영향을 주지 않는다", () => {
    const { client, sockets, statuses } = setup();
    const got: unknown[] = [];
    client.onEvent((e) => got.push(e));
    client.start();
    sockets[0].drop();
    vi.advanceTimersByTime(1000);
    sockets[1].open();
    sockets[1].receive({ type: "ready" });
    sockets[0].receive({ type: "stale" });
    sockets[0].drop();
    expect(got).toEqual([]);
    expect(statuses.at(-1)).toEqual({ state: "connected", epoch: 1 });
  });
});
