import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { Pn532 } from "./pn532";
import { ACK, FrameReader, toHex } from "./pn532Frame";
import { pickPort } from "./port";
import { NfcReader, type NfcStatus, type OpenedPort, type PortProvider } from "./reader";

const b = (hex: string) => Buffer.from(hex.replace(/\s/g, ""), "hex");

/** 응답 프레임 만들기 (TFI D5 + 명령코드+1 + 데이터) */
function reply(cmdPlusOne: number, data: number[] = []): Buffer {
  const body = [0xd5, cmdPlusOne, ...data];
  const len = body.length;
  const sum = body.reduce((a, x) => a + x, 0);
  return Buffer.from([0, 0, 0xff, len, (0x100 - len) & 0xff, ...body, (0x100 - (sum & 0xff)) & 0xff, 0]);
}

/** 가짜 PN532: 받은 명령에 맞춰 ACK + 응답을 돌려준다. cards 는 InListPassiveTarget 호출마다 하나씩 소비 (null = 카드 없음) */
class FakeDevice {
  readonly emitter = new EventEmitter();
  readonly received: string[] = [];
  cards: (string | null)[] = [];
  silent = false;

  transport = {
    write: async (data: Buffer) => {
      const reader = new FrameReader();
      // 깨우기 프리앰블(55 55 00..)은 건너뛰고 프레임만 해석한다
      const frames = reader.push(data);
      void frames;
      const idx = data.indexOf(Buffer.from([0x00, 0x00, 0xff]), data.length > 16 ? 14 : 0);
      const frame = data.subarray(idx);
      const len = frame[3];
      const cmd = frame[6];
      this.received.push(toHex(frame.subarray(5, 5 + len)));
      if (this.silent) return;
      queueMicrotask(() => {
        this.emitter.emit("data", ACK);
        this.emitter.emit("data", this.responseFor(cmd, frame.subarray(7, 5 + len)));
      });
    },
    onData: (cb: (c: Buffer) => void) => {
      this.emitter.on("data", cb);
    },
  };

  private responseFor(cmd: number, args: Buffer): Buffer {
    switch (cmd) {
      case 0x14:
        return reply(0x15);
      case 0x02:
        return reply(0x03, [0x32, 0x01, 0x06, 0x07]);
      case 0x32:
        return reply(0x33);
      case 0x4a: {
        void args;
        const uid = this.cards.shift() ?? null;
        if (!uid) return reply(0x4b, [0x00]);
        const bytes = [...Buffer.from(uid, "hex")];
        return reply(0x4b, [0x01, 0x01, 0x00, 0x04, 0x08, bytes.length, ...bytes]);
      }
      default:
        throw new Error(`가짜 장치가 모르는 명령 0x${cmd.toString(16)}`);
    }
  }
}

describe("Pn532", () => {
  it("init 은 SAM 설정 → 펌웨어 → RF 설정 순서로 명령을 보낸다", async () => {
    const dev = new FakeDevice();
    const fw = await new Pn532(dev.transport).init();
    expect(fw).toMatchObject({ ic: 0x32, version: 1, revision: 6 });
    expect(dev.received).toEqual(["D4140114" + "01", "D402", "D4320 5FF0101".replace(/\s/g, "")].map((s) => s.toUpperCase()));
  });

  it("카드를 찾아 UID 를 돌려준다", async () => {
    const dev = new FakeDevice();
    dev.cards = ["04A1B2C3D4E5F6", null];
    const pn = new Pn532(dev.transport);
    expect((await pn.listPassiveTarget())?.uid).toBe("04A1B2C3D4E5F6");
    expect(await pn.listPassiveTarget()).toBeNull();
  });

  it("장치가 대답하지 않으면 시간 초과 오류", async () => {
    const dev = new FakeDevice();
    dev.silent = true;
    await expect(new Pn532(dev.transport, { ackTimeoutMs: 20 }).command([0x02])).rejects.toThrow(/ACK 응답 없음/);
  });

  it("명령 여러 개를 동시에 불러도 차례로 처리한다", async () => {
    const dev = new FakeDevice();
    dev.cards = ["AABBCCDD", "11223344"];
    const pn = new Pn532(dev.transport);
    const [x, y] = await Promise.all([pn.listPassiveTarget(), pn.listPassiveTarget()]);
    expect([x?.uid, y?.uid]).toEqual(["AABBCCDD", "11223344"]);
  });
});

describe("NfcReader", () => {
  function setup(devices: FakeDevice[], paths: (string | null)[] = ["COM3"]) {
    let opens = 0;
    const closers: (() => void)[] = [];
    const provider: PortProvider = {
      find: async () => (paths.length > 1 ? (paths.shift() ?? null) : paths[0]),
      open: async (path): Promise<OpenedPort> => {
        const dev = devices[Math.min(opens++, devices.length - 1)];
        return {
          path,
          transport: dev.transport,
          close: async () => undefined,
          onClose: (cb) => {
            closers.push(cb);
          },
        };
      },
    };
    const reader = new NfcReader(provider, { pollIntervalMs: 1, retryDelayMs: 1, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    return { reader, closers, opens: () => opens };
  }

  const waitFor = async (cond: () => boolean, ms = 1000) => {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error("시간 초과");
      await new Promise((r) => setTimeout(r, 2));
    }
  };

  it("같은 카드를 대고 있는 동안 card 이벤트는 한 번, 떼면 removed", async () => {
    const dev = new FakeDevice();
    dev.cards = ["04A1B2C3", "04A1B2C3", "04A1B2C3", null, null, null];
    const { reader } = setup([dev]);
    const cards: string[] = [];
    const removed: string[] = [];
    reader.on("card", (t) => cards.push(t.uid));
    reader.on("removed", (u) => removed.push(u));
    reader.start();
    await waitFor(() => removed.length === 1);
    await reader.stop();
    expect(cards).toEqual(["04A1B2C3"]);
    expect(removed).toEqual(["04A1B2C3"]);
  });

  it("떼었다 다시 대면 card 이벤트가 다시 난다", async () => {
    const dev = new FakeDevice();
    dev.cards = ["AABBCCDD", null, null, "AABBCCDD"];
    const { reader } = setup([dev]);
    const cards: string[] = [];
    reader.on("card", (t) => cards.push(t.uid));
    reader.start();
    await waitFor(() => cards.length === 2);
    await reader.stop();
  });

  it("포트가 없으면 searching 상태로 기다리다가, 생기면 ready", async () => {
    const dev = new FakeDevice();
    const { reader } = setup([dev], [null, null, "COM3"]);
    const states: NfcStatus["state"][] = [];
    reader.on("status", (s: NfcStatus) => states.push(s.state));
    reader.start();
    await waitFor(() => reader.getStatus().state === "ready");
    await reader.stop();
    expect(states[0]).toBe("searching");
    expect(states).toContain("connecting");
    expect(reader.getStatus().firmware).toBe("1.6");
  });

  it("USB 가 뽑혀 포트가 닫히면 다시 연결한다", async () => {
    const d1 = new FakeDevice();
    const d2 = new FakeDevice();
    const { reader, closers, opens } = setup([d1, d2]);
    reader.start();
    await waitFor(() => reader.getStatus().state === "ready");
    closers[0]();
    await waitFor(() => opens() === 2 && reader.getStatus().state === "ready");
    await reader.stop();
  });

  it("stop 으로 끝낼 때는 error 상태가 되지 않는다", async () => {
    const dev = new FakeDevice();
    const { reader, closers } = setup([dev]);
    const states: string[] = [];
    reader.on("status", (s: NfcStatus) => states.push(s.state));
    reader.start();
    await waitFor(() => reader.getStatus().state === "ready");
    const stopping = reader.stop();
    closers[0](); // stop 이 포트를 닫으면 close 이벤트가 온다
    await stopping;
    expect(states).not.toContain("error");
  });

  it("장치가 응답하지 않으면 error 상태가 되고 계속 재시도한다", async () => {
    const dev = new FakeDevice();
    dev.silent = true;
    const { reader, opens } = setup([dev]);
    reader.start();
    await waitFor(() => reader.getStatus().state === "error" && opens() >= 2, 4000);
    await reader.stop();
  }, 6000);
});

describe("pickPort", () => {
  const ports = [
    { path: "COM1" },
    { path: "COM3", vendorId: "1A86", productId: "7523" },
    { path: "COM7", vendorId: "2341", productId: "0043" },
  ];
  it("CH340 을 고른다 (대소문자 무관)", () => {
    expect(pickPort(ports)).toBe("COM3");
    expect(pickPort([{ path: "/dev/ttyUSB0", vendorId: "1a86", productId: "7523" }])).toBe("/dev/ttyUSB0");
  });
  it("CH340 이 없으면 null", () => {
    expect(pickPort([ports[0], ports[2]])).toBeNull();
  });
  it("지정한 포트가 있으면 그것만", () => {
    expect(pickPort(ports, "com7")).toBe("COM7");
    expect(pickPort(ports, "COM9")).toBeNull();
  });
});

void b;
