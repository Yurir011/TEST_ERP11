/**
 * 새 메일 주기적 확인. 회사 메일 서버(다음스마트워크)는 IDLE(서버가 새 메일을 먼저 알려 주는 기능)을 지원하지 않아서,
 * 일정한 간격으로 받은메일함을 서버와 맞춰 보는 방식으로 새 메일을 알아낸다.
 * 앱이 트레이에 내려가 있어도 계속 동작한다. 확인에 실패해도(오프라인 등) 앱이 멈추지 않고 다음 시간에 다시 시도한다.
 */
import { type Logger, silentLogger } from "../log";
import type { NewMailInfo } from "./types";

export interface PollResult {
  unread: number;
  newMail: NewMailInfo[];
  changed: boolean;
}

export interface PollerDeps {
  /** 서버와 맞춰 보고 결과를 돌려준다. 계정이 없으면 아무 일도 하지 않고 빈 결과를 돌려주면 된다 */
  poll: () => Promise<{ ok: true; value: PollResult } | { ok: false; error: string }>;
  onResult: (result: PollResult) => void;
  intervalMs: number;
  /** 앱을 켠 뒤 첫 확인까지 기다리는 시간 (창이 뜨는 일과 겹치지 않게) */
  initialDelayMs?: number;
  log?: Logger;
}

export const DEFAULT_POLL_INTERVAL_MS = 120_000; // 2분
export const MIN_POLL_INTERVAL_MS = 1_000;

/** 환경변수 BENCH_MAIL_POLL_MS 등 바깥에서 온 값을 안전한 범위로 바꾼다 (이상한 값은 기본값) */
export function resolvePollInterval(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= MIN_POLL_INTERVAL_MS ? Math.min(Math.trunc(n), 3_600_000) : DEFAULT_POLL_INTERVAL_MS;
}

export class MailPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;
  private failing = false;
  private readonly log: Logger;

  constructor(private readonly deps: PollerDeps) {
    this.log = deps.log ?? silentLogger;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(this.deps.initialDelayMs ?? 5_000);
    this.log.info(`[Mail] 새 메일 확인 시작: ${Math.round(this.deps.intervalMs / 1000)}초마다`);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.pollNow().finally(() => this.schedule(this.deps.intervalMs));
    }, ms);
  }

  /** 지금 한 번 확인한다. 이미 확인 중이면 겹쳐 하지 않는다. 결과는 deps.onResult 로 전달된다. */
  async pollNow(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.deps.poll();
      if (!r.ok) {
        // 같은 실패가 계속되면 로그가 넘치지 않도록 처음 한 번만 경고로 남긴다
        if (!this.failing) this.log.warn(`[Mail] 새 메일 확인 실패: ${r.error}`);
        else this.log.debug(`[Mail] 새 메일 확인 실패(계속): ${r.error}`);
        this.failing = true;
        return;
      }
      if (this.failing) this.log.info("[Mail] 새 메일 확인이 다시 정상으로 돌아왔습니다");
      this.failing = false;
      this.deps.onResult(r.value);
    } catch (err) {
      if (!this.failing) this.log.warn(`[Mail] 새 메일 확인 중 오류: ${(err as Error).message}`);
      this.failing = true;
    } finally {
      this.running = false;
    }
  }
}
