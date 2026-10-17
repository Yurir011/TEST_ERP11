/**
 * PN532 명령 보내기 (HSU/UART). 시리얼 포트는 Transport 로 감싸 받으므로 테스트에서는 가짜 장치를 끼울 수 있다.
 * 한 번에 명령 하나만 보낸다: 명령 → ACK → 응답 프레임(TFI D5, 명령 코드 + 1).
 */
import { type Logger, silentLogger } from "../log";
import {
  ACK,
  CMD,
  type FirmwareVersion,
  FrameReader,
  type PassiveTarget,
  TFI_PN532_TO_HOST,
  WAKEUP,
  buildFrame,
  parseFirmwareVersion,
  parseListPassiveTarget,
  toHex,
} from "./pn532Frame";

export interface Transport {
  write(data: Buffer): Promise<void>;
  onData(cb: (chunk: Buffer) => void): void;
}

export interface Pn532Options {
  ackTimeoutMs?: number | undefined;
  responseTimeoutMs?: number | undefined;
  log?: Logger;
}

interface Pending {
  cmd: number;
  acked: boolean;
  resolve: (data: Buffer) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Pn532Error extends Error {}

export class Pn532 {
  private readonly reader = new FrameReader();
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly ackTimeoutMs: number;
  private readonly responseTimeoutMs: number;
  private readonly log: Logger;

  constructor(
    private readonly transport: Transport,
    opts: Pn532Options = {},
  ) {
    this.ackTimeoutMs = opts.ackTimeoutMs ?? 500;
    this.responseTimeoutMs = opts.responseTimeoutMs ?? 1500;
    this.log = opts.log ?? silentLogger;
    transport.onData((chunk) => this.onData(chunk));
  }

  /** 깨우기 + SAM 설정 + 펌웨어 확인 + 카드가 없을 때 바로 돌아오도록 재시도 횟수 설정 */
  async init(): Promise<FirmwareVersion> {
    // SAMConfiguration: 일반 모드(01), 타임아웃 1초(14), IRQ 사용(01). 깨우기 프리앰블을 같은 쓰기에 붙여 보낸다.
    await this.command([CMD.SAMConfiguration, 0x01, 0x14, 0x01], WAKEUP);
    const fw = parseFirmwareVersion(await this.command([CMD.GetFirmwareVersion]));
    if (fw.ic !== 0x32) throw new Pn532Error(`PN532 가 아닌 칩입니다 (IC=0x${fw.ic.toString(16)})`);
    // RFConfiguration 항목 05(MaxRetries): ATR 재시도 FF, PSL 01, 카드 찾기 01 → 카드가 없으면 InListPassiveTarget 이 곧바로 0장으로 돌아온다
    await this.command([CMD.RFConfiguration, 0x05, 0xff, 0x01, 0x01]);
    this.log.info(`[NFC] PN532 준비 완료: 펌웨어 ${fw.version}.${fw.revision}`);
    return fw;
  }

  /** 106kbps Type A(MIFARE, NTAG 등) 카드 한 장 찾기. 없으면 null. */
  async listPassiveTarget(): Promise<PassiveTarget | null> {
    return parseListPassiveTarget(await this.command([CMD.InListPassiveTarget, 0x01, 0x00]));
  }

  /** 명령을 차례로 보낸다 (앞 명령이 끝나야 다음 명령). 응답 데이터(data[0] = 명령 코드 + 1)를 돌려준다. */
  command(payload: number[], prefix?: Buffer): Promise<Buffer> {
    const run = () => this.send(payload, prefix);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private send(payload: number[], prefix?: Buffer): Promise<Buffer> {
    const cmd = payload[0];
    const frame = buildFrame(payload);
    return new Promise<Buffer>((resolve, reject) => {
      const pending: Pending = {
        cmd,
        acked: false,
        resolve,
        reject,
        timer: setTimeout(() => this.fail(new Pn532Error(`ACK 응답 없음 (명령 0x${hex(cmd)})`)), this.ackTimeoutMs),
      };
      this.pending = pending;
      this.log.debug(`[NFC] 명령 보냄: ${toHex(frame)}`);
      this.transport.write(prefix ? Buffer.concat([prefix, frame]) : frame).catch((err: Error) => this.fail(err));
    });
  }

  private onData(chunk: Buffer): void {
    for (const f of this.reader.push(chunk)) {
      const p = this.pending;
      if (f.kind === "invalid") {
        this.log.warn(`[NFC] 잘못된 프레임 무시: ${f.reason}`);
        continue;
      }
      if (!p) {
        this.log.debug(`[NFC] 기다리지 않은 프레임 무시: ${f.kind}`);
        continue;
      }
      if (f.kind === "ack") {
        p.acked = true;
        clearTimeout(p.timer);
        p.timer = setTimeout(() => this.fail(new Pn532Error(`응답 없음 (명령 0x${hex(p.cmd)})`)), this.responseTimeoutMs);
      } else if (f.kind === "nack") {
        this.fail(new Pn532Error(`PN532 가 명령을 받지 못했습니다(NACK, 명령 0x${hex(p.cmd)})`));
      } else if (f.kind === "error") {
        this.fail(new Pn532Error(`PN532 처리 오류 (명령 0x${hex(p.cmd)})`));
      } else if (f.tfi === TFI_PN532_TO_HOST && f.data[0] === p.cmd + 1) {
        clearTimeout(p.timer);
        this.pending = null;
        this.log.debug(`[NFC] 응답 받음: ${toHex(f.data)}`);
        p.resolve(f.data);
      } else {
        this.log.debug(`[NFC] 다른 명령의 응답 무시: ${toHex(f.data)}`);
      }
    }
  }

  private fail(err: Error): void {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    this.reader.reset();
    p.reject(err);
  }
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

export { ACK };
