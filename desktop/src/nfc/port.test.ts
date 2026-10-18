import { describe, expect, it, vi } from "vitest";

/** 가짜 시리얼 포트: 열리고, 닫히며, 'error' 를 낼 수 있다 */
const { FakePort } = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class FakePort extends EventEmitter {
    static last: FakePort;
    isOpen = false;
    closeCalls = 0;
    constructor() {
      super();
      FakePort.last = this;
    }
    open(cb: (err?: Error) => void) {
      this.isOpen = true;
      cb();
    }
    close(cb: () => void) {
      this.closeCalls++;
      this.isOpen = false;
      this.emit("close");
      cb();
    }
  }
  return { FakePort };
});
vi.mock("serialport", () => ({ SerialPort: FakePort }));

import { serialPortProvider } from "./port";

describe("시리얼 포트 오류 처리", () => {
  it("포트가 'error' 를 알려도 앱이 죽지 않고(받는 곳이 있다), 포트를 닫아 연결 끊김으로 알린다", async () => {
    const warn = vi.fn();
    const opened = await serialPortProvider({ log: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() } }).open("COM3");
    const onClose = vi.fn();
    opened.onClose(onClose);
    // 받는 곳이 없으면 EventEmitter 는 여기서 예외를 던진다 (실제 앱에서는 Uncaught Exception 오류 창)
    expect(() => FakePort.last.emit("error", new Error("Writing to COM port (GetOverlappedResult): Operation aborted"))).not.toThrow();
    expect(FakePort.last.closeCalls).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Operation aborted"));
  });

  it("이미 닫힌 포트의 오류는 다시 닫지 않는다", async () => {
    const opened = await serialPortProvider().open("COM3");
    await opened.close();
    const before = FakePort.last.closeCalls;
    expect(() => FakePort.last.emit("error", new Error("x"))).not.toThrow();
    expect(FakePort.last.closeCalls).toBe(before);
  });
});
