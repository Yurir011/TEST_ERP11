/**
 * NFC 리더 감시: 포트 찾기 → 열기 → PN532 준비 → 카드 찾기 반복. 오류가 나거나 USB 가 뽑히면 잠시 뒤 처음부터 다시 한다.
 *
 * 이벤트
 *  - status(NfcStatus): 상태가 바뀔 때
 *  - card(PassiveTarget): 카드가 새로 닿았을 때 (같은 카드를 대고 있는 동안은 다시 내지 않는다)
 *  - removed(uid): 카드가 떨어졌을 때 (연속 missingPolls 번 못 찾으면)
 */
import { EventEmitter } from "node:events";

import { type Logger, silentLogger } from "../log";
import { Pn532, type Transport } from "./pn532";
import type { PassiveTarget } from "./pn532Frame";

export type NfcState = "searching" | "connecting" | "ready" | "busy" | "error";

export interface NfcStatus {
  state: NfcState;
  port?: string;
  firmware?: string;
  message?: string;
}

export interface OpenedPort {
  path: string;
  transport: Transport;
  close(): Promise<void>;
  /** 포트가 닫히면(USB 뽑힘 등) 호출 */
  onClose(cb: () => void): void;
}

export interface PortProvider {
  /** 쓸 포트 경로. 없으면 null */
  find(): Promise<string | null>;
  open(path: string): Promise<OpenedPort>;
}

export interface ReaderOptions {
  pollIntervalMs?: number;
  retryDelayMs?: number;
  missingPolls?: number;
  log?: Logger;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class NfcReader extends EventEmitter {
  private running = false;
  private status: NfcStatus = { state: "searching" };
  private present: { uid: string; missing: number } | null = null;
  private readonly pollIntervalMs: number;
  private readonly retryDelayMs: number;
  private readonly missingPolls: number;
  private readonly log: Logger;
  private readonly sleep: (ms: number) => Promise<void>;
  private loop: Promise<void> | null = null;
  private current: OpenedPort | null = null;

  constructor(
    private readonly ports: PortProvider,
    opts: ReaderOptions = {},
  ) {
    super();
    this.pollIntervalMs = opts.pollIntervalMs ?? 300;
    this.retryDelayMs = opts.retryDelayMs ?? 2000;
    this.missingPolls = opts.missingPolls ?? 2;
    this.log = opts.log ?? silentLogger;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  getStatus(): NfcStatus {
    return this.status;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.current?.close().catch(() => undefined);
    await this.loop;
  }

  private setStatus(s: NfcStatus): void {
    const changed = s.state !== this.status.state || s.port !== this.status.port || s.message !== this.status.message;
    this.status = s;
    if (changed) {
      this.log.info(`[NFC] 상태: ${s.state}${s.port ? ` (${s.port})` : ""}${s.message ? ` - ${s.message}` : ""}`);
      this.emit("status", s);
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.session();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.setStatus({ state: isBusy(message) ? "busy" : "error", port: this.status.port, message: isBusy(message) ? "다른 프로그램이 포트를 사용 중입니다" : message });
      }
      if (this.present) {
        this.emit("removed", this.present.uid);
        this.present = null;
      }
      await this.current?.close().catch(() => undefined);
      this.current = null;
      if (this.running) await this.sleep(this.retryDelayMs);
    }
  }

  private async session(): Promise<void> {
    if (this.status.state !== "busy" && this.status.state !== "error") this.setStatus({ state: "searching" });
    const path = await this.ports.find();
    if (!path) {
      this.setStatus({ state: "searching", message: "NFC 리더(CH340)를 찾지 못했습니다" });
      return;
    }
    this.setStatus({ state: "connecting", port: path });
    const opened = await this.ports.open(path);
    this.current = opened;
    let closed = false;
    opened.onClose(() => {
      closed = true;
    });
    const pn = new Pn532(opened.transport, { log: this.log });
    const fw = await pn.init();
    this.setStatus({ state: "ready", port: path, firmware: `${fw.version}.${fw.revision}` });

    while (this.running && !closed) {
      const target = await pn.listPassiveTarget();
      this.track(target);
      await this.sleep(this.pollIntervalMs);
    }
    if (closed) throw new Error("리더 연결이 끊어졌습니다");
  }

  private track(target: PassiveTarget | null): void {
    if (target) {
      if (this.present?.uid !== target.uid) {
        if (this.present) this.emit("removed", this.present.uid);
        this.log.info(`[NFC] 카드 감지: UID 끝 4자리 ${target.uid.slice(-4)}, 길이 ${target.uid.length / 2}바이트, SAK=${target.sak.toString(16)}`);
        this.emit("card", target);
      }
      this.present = { uid: target.uid, missing: 0 };
      return;
    }
    if (!this.present) return;
    this.present.missing += 1;
    if (this.present.missing >= this.missingPolls) {
      this.log.debug(`[NFC] 카드 떨어짐: 끝 4자리 ${this.present.uid.slice(-4)}`);
      this.emit("removed", this.present.uid);
      this.present = null;
    }
  }
}

function isBusy(message: string): boolean {
  return /access denied|resource busy|ebusy|cannot lock/i.test(message);
}
