/**
 * CH340 USB-시리얼 포트 찾기·열기 (PN532 HSU, 115200bps 8N1).
 * NFC_PORT 환경변수(예: COM3, /dev/ttyUSB0)로 포트를 직접 지정할 수 있다. 지정하지 않으면 CH340(VID 1A86, PID 7523)을 찾는다.
 */
import { SerialPort } from "serialport";

import { type Logger, silentLogger } from "../log";
import type { OpenedPort, PortProvider } from "./reader";

export const CH340 = { vendorId: "1a86", productId: "7523" };
export const BAUD_RATE = 115200;

export interface PortInfoLike {
  path: string;
  vendorId?: string;
  productId?: string;
}

/** 포트 목록에서 쓸 포트를 고른다. 지정한 포트가 있으면 그것, 없으면 첫 번째 CH340. */
export function pickPort(ports: PortInfoLike[], preferred?: string): string | null {
  if (preferred) {
    const hit = ports.find((p) => p.path.toLowerCase() === preferred.toLowerCase());
    return hit ? hit.path : null;
  }
  const ch340 = ports.filter((p) => p.vendorId?.toLowerCase() === CH340.vendorId && p.productId?.toLowerCase() === CH340.productId);
  return ch340.length ? ch340[0].path : null;
}

export function serialPortProvider(opts: { preferred?: string; log?: Logger } = {}): PortProvider {
  const log = opts.log ?? silentLogger;
  return {
    async find() {
      const list = await SerialPort.list();
      log.debug(`[NFC] 시리얼 포트 목록: ${list.map((p) => `${p.path}(${p.vendorId ?? "-"}:${p.productId ?? "-"})`).join(", ") || "없음"}`);
      return pickPort(list, opts.preferred);
    },
    open(path) {
      return new Promise<OpenedPort>((resolve, reject) => {
        const port = new SerialPort({ path, baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: "none", autoOpen: false });
        port.open((err) => {
          if (err) return reject(err);
          log.debug(`[NFC] 포트 열림: ${path} ${BAUD_RATE}bps`);
          resolve({
            path,
            transport: {
              write: (data) =>
                new Promise<void>((res, rej) => {
                  port.write(data, (e) => (e ? rej(e) : port.drain((e2) => (e2 ? rej(e2) : res()))));
                }),
              onData: (cb) => port.on("data", cb),
            },
            close: () =>
              new Promise<void>((res) => {
                if (!port.isOpen) return res();
                port.close(() => res());
              }),
            onClose: (cb) => port.on("close", cb),
          });
        });
      });
    },
  };
}
