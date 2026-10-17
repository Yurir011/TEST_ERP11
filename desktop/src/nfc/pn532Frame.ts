/**
 * PN532 시리얼(HSU) 프레임 만들기·해석. 하드웨어 없이 테스트할 수 있도록 순수 함수와 바이트 버퍼만 다룬다.
 *
 * 일반 정보 프레임: 00 00 FF LEN LCS TFI PD0..PDn DCS 00
 *   - LEN = TFI + PD 바이트 수, LEN + LCS ≡ 0 (mod 256)
 *   - TFI: D4 = PC → PN532, D5 = PN532 → PC
 *   - TFI + PD 합 + DCS ≡ 0 (mod 256)
 * ACK 00 00 FF 00 FF 00 / NACK 00 00 FF FF 00 00 / 오류 프레임 00 00 FF 01 FF 7F 81 00
 * 확장 프레임(LEN=FF, LCS=FF)은 응답이 짧은 이 용도에서는 쓰지 않으므로 잘못된 프레임으로 처리한다.
 */

export const TFI_HOST_TO_PN532 = 0xd4;
export const TFI_PN532_TO_HOST = 0xd5;

export const CMD = {
  GetFirmwareVersion: 0x02,
  SAMConfiguration: 0x14,
  RFConfiguration: 0x32,
  InListPassiveTarget: 0x4a,
  InRelease: 0x52,
} as const;

/** HSU 모드의 PN532 를 깨우는 긴 프리앰블 (데이터시트 7.2.11: 0x55 뒤 0x00 여러 개) */
export const WAKEUP = Buffer.from([0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

export const ACK = Buffer.from([0x00, 0x00, 0xff, 0x00, 0xff, 0x00]);

export function buildFrame(payload: readonly number[]): Buffer {
  if (payload.length === 0 || payload.length > 254) throw new RangeError(`PN532 명령 길이가 잘못됐습니다: ${payload.length}`);
  const body = [TFI_HOST_TO_PN532, ...payload];
  const len = body.length;
  const lcs = (0x100 - len) & 0xff;
  const sum = body.reduce((a, b) => a + b, 0);
  const dcs = (0x100 - (sum & 0xff)) & 0xff;
  return Buffer.from([0x00, 0x00, 0xff, len, lcs, ...body, dcs, 0x00]);
}

export type Frame =
  | { kind: "ack" }
  | { kind: "nack" }
  | { kind: "error" } // PN532 가 명령을 처리하지 못했다는 응용 오류 프레임
  | { kind: "data"; tfi: number; data: Buffer } // data[0] = 명령 코드 + 1
  | { kind: "invalid"; reason: string };

/**
 * 시리얼에서 조각조각 들어오는 바이트를 모아 완성된 프레임을 꺼낸다.
 * 시작 코드(00 FF) 앞의 쓰레기 바이트는 버리고, 체크섬이 틀린 프레임은 invalid 로 알린 뒤 다음 시작 코드부터 다시 찾는다.
 */
export class FrameReader {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Frame[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const frames: Frame[] = [];
    for (;;) {
      const r = this.next();
      if (r === null) break;
      frames.push(r);
    }
    return frames;
  }

  /** 아직 다 들어오지 않은 바이트 수 (테스트·진단용) */
  get pending(): number {
    return this.buf.length;
  }

  reset(): void {
    this.buf = Buffer.alloc(0);
  }

  private next(): Frame | null {
    const start = findStartCode(this.buf);
    if (start < 0) {
      // 마지막 바이트가 00 이면 다음 조각의 FF 와 이어질 수 있으니 남긴다
      this.buf = this.buf.length && this.buf[this.buf.length - 1] === 0x00 ? this.buf.subarray(this.buf.length - 1) : Buffer.alloc(0);
      return null;
    }
    const b = this.buf.subarray(start);
    if (b.length < 4) {
      this.buf = b;
      return null;
    }
    const len = b[2];
    const lcs = b[3];
    if (len === 0x00 && lcs === 0xff) {
      this.buf = b.subarray(4);
      return { kind: "ack" };
    }
    if (len === 0xff && lcs === 0x00) {
      this.buf = b.subarray(4);
      return { kind: "nack" };
    }
    if (((len + lcs) & 0xff) !== 0 || len === 0) {
      this.buf = b.subarray(2);
      return { kind: "invalid", reason: `길이 체크섬 오류 (LEN=${hex(len)}, LCS=${hex(lcs)})` };
    }
    if (b.length < 4 + len + 1) {
      this.buf = b;
      return null;
    }
    const body = b.subarray(4, 4 + len);
    const dcs = b[4 + len];
    const sum = body.reduce((a, x) => a + x, 0);
    if (((sum + dcs) & 0xff) !== 0) {
      this.buf = b.subarray(2);
      return { kind: "invalid", reason: "데이터 체크섬 오류" };
    }
    this.buf = b.subarray(4 + len + 1);
    if (len === 1 && body[0] === 0x7f) return { kind: "error" };
    return { kind: "data", tfi: body[0], data: Buffer.from(body.subarray(1)) };
  }
}

function findStartCode(b: Buffer): number {
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i] === 0x00 && b[i + 1] === 0xff) return i;
  }
  return -1;
}

export interface FirmwareVersion {
  ic: number; // PN532 = 0x32
  version: number;
  revision: number;
  support: number;
}

export function parseFirmwareVersion(data: Buffer): FirmwareVersion {
  if (data.length < 5 || data[0] !== CMD.GetFirmwareVersion + 1) throw new Error(`펌웨어 응답 형식이 아닙니다: ${toHex(data)}`);
  return { ic: data[1], version: data[2], revision: data[3], support: data[4] };
}

export interface PassiveTarget {
  uid: string; // 대문자 16진수, 구분자 없음 (예: 04A1B2C3D4E5F6) — 서버에 보내는 표준 형식
  atqa: string; // SENS_RES 2바이트
  sak: number; // SEL_RES
}

/** InListPassiveTarget(106kbps Type A) 응답. 카드가 없으면 null. */
export function parseListPassiveTarget(data: Buffer): PassiveTarget | null {
  if (data.length < 2 || data[0] !== CMD.InListPassiveTarget + 1) throw new Error(`카드 감지 응답 형식이 아닙니다: ${toHex(data)}`);
  const count = data[1];
  if (count === 0) return null;
  // Tg(1) SENS_RES(2) SEL_RES(1) NFCIDLength(1) NFCID1(n) [ATS]
  if (data.length < 7) throw new Error(`카드 응답이 짧습니다: ${toHex(data)}`);
  const uidLength = data[6];
  if (![4, 7, 10].includes(uidLength) || data.length < 7 + uidLength) throw new Error(`UID 길이가 잘못됐습니다: ${uidLength}`);
  return {
    uid: toHex(data.subarray(7, 7 + uidLength)),
    atqa: toHex(data.subarray(3, 5)),
    sak: data[5],
  };
}

export function toHex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex").toUpperCase();
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}
