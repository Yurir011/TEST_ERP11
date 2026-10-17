import { logDebug } from "./logger";

// 서버가 먼저 알려 주는 실시간 연결(WebSocket, 서버 프로토콜은 backend/app/routers/messenger_ws.py).
// - 연결하면 첫 메시지로 로그인 토큰을 보낸다 (주소에 넣지 않는다).
// - 끊어지면 1 → 2 → 5 → 10초 간격으로 다시 연결한다. 다시 연결될 때마다 epoch 가 늘어나므로, 화면은 epoch 가 바뀌면
//   그 사이 놓친 것을 REST 로 다시 받는다 (메시지를 잃지 않는다).
// - 30초마다 ping 을 보내 연결이 살아 있는지 확인하고, 응답이 없으면 끊고 다시 연결한다.

export type ConnectionState = "connecting" | "connected" | "disconnected";
export interface ConnectionStatus {
  state: ConnectionState;
  /** 연결(준비 완료)에 성공할 때마다 1씩 늘어난다 */
  epoch: number;
}

export interface SocketLike {
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface RealtimeOptions<E> {
  url: string;
  getToken: () => string | null;
  createSocket?: (url: string) => SocketLike;
  backoffMs?: number[];
  pingMs?: number;
  pongTimeoutMs?: number;
  /** 서버 이벤트 중 이 클라이언트가 전달할 종류를 거르는 검사 (기본: type 이 있는 객체) */
  accept?: (data: unknown) => data is E;
}

const CLOSE_UNAUTHORIZED = 4401;
const UNAUTHORIZED_RETRY_MS = 60_000;

export function realtimeUrl(loc: { protocol: string; host: string } = window.location): string {
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/api/ws`;
}

function isEventObject(data: unknown): data is { type: string } {
  return typeof data === "object" && data !== null && typeof (data as { type?: unknown }).type === "string";
}

export class RealtimeClient<E extends { type: string } = { type: string }> {
  private socket: SocketLike | null = null;
  private started = false;
  private attempt = 0;
  private epoch = 0;
  private state: ConnectionState = "disconnected";
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventListeners = new Set<(e: E) => void>();
  private readonly statusListeners = new Set<(s: ConnectionStatus) => void>();
  private readonly backoff: number[];
  private readonly pingMs: number;
  private readonly pongTimeoutMs: number;

  private readonly opts: RealtimeOptions<E>;

  constructor(opts: RealtimeOptions<E>) {
    this.opts = opts;
    this.backoff = opts.backoffMs ?? [1000, 2000, 5000, 10000];
    this.pingMs = opts.pingMs ?? 30_000;
    this.pongTimeoutMs = opts.pongTimeoutMs ?? 10_000;
  }

  get status(): ConnectionStatus {
    return { state: this.state, epoch: this.epoch };
  }

  onEvent(cb: (e: E) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  onStatus(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    this.clearTimers();
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      s.close(1000);
    }
    this.setState("disconnected");
  }

  private setState(state: ConnectionState): void {
    if (state === this.state && state !== "connected") return;
    this.state = state;
    for (const cb of [...this.statusListeners]) cb(this.status);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.retryTimer = this.pingTimer = this.pongTimer = null;
  }

  private connect(): void {
    if (!this.started) return;
    const token = this.opts.getToken();
    if (!token) {
      this.scheduleRetry(this.backoff[this.backoff.length - 1]);
      return;
    }
    this.setState("connecting");
    const socket = (this.opts.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(this.opts.url);
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
    socket.onmessage = (ev) => this.handleMessage(socket, ev.data);
    socket.onerror = () => undefined; // 닫힘 이벤트에서 처리한다
    socket.onclose = (ev) => this.handleClose(socket, ev.code);
  }

  private handleMessage(socket: SocketLike, raw: unknown): void {
    if (socket !== this.socket || typeof raw !== "string") return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isEventObject(data)) return;
    if (data.type === "ready") {
      this.attempt = 0;
      this.epoch += 1;
      logDebug("Realtime", `연결 준비 완료 (epoch ${this.epoch})`);
      this.setState("connected");
      this.startPing();
      return;
    }
    if (data.type === "pong") {
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = null;
      return;
    }
    const accept = this.opts.accept ?? ((d: unknown): d is E => isEventObject(d));
    if (!accept(data)) return;
    for (const cb of [...this.eventListeners]) {
      try {
        cb(data);
      } catch (err) {
        console.error("[Realtime] 이벤트 처리 중 오류", err);
      }
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const s = this.socket;
      if (!s || this.state !== "connected") return;
      try {
        s.send(JSON.stringify({ type: "ping" }));
      } catch {
        s.close();
        return;
      }
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        logDebug("Realtime", "ping 응답이 없어 연결을 끊고 다시 연결합니다");
        this.socket?.close();
      }, this.pongTimeoutMs);
    }, this.pingMs);
  }

  private handleClose(socket: SocketLike, code: number): void {
    if (socket !== this.socket) return;
    this.socket = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = this.pongTimer = null;
    this.setState("disconnected");
    if (!this.started) return;
    // 로그인이 유효하지 않아 끊긴 경우(4401)는 서버를 괴롭히지 않도록 오래 기다렸다가 다시 시도한다
    const delay = code === CLOSE_UNAUTHORIZED ? UNAUTHORIZED_RETRY_MS : this.backoff[Math.min(this.attempt, this.backoff.length - 1)];
    this.attempt += 1;
    logDebug("Realtime", `연결이 끊겼습니다 (코드 ${code}). ${delay}ms 뒤 다시 연결합니다`);
    this.scheduleRetry(delay);
  }

  private scheduleRetry(delay: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }
}
