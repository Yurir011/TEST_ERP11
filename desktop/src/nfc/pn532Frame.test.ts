import { describe, expect, it } from "vitest";

import { ACK, CMD, FrameReader, buildFrame, parseFirmwareVersion, parseListPassiveTarget, toHex } from "./pn532Frame";

const b = (hex: string) => Buffer.from(hex.replace(/\s/g, ""), "hex");

describe("buildFrame", () => {
  it("GetFirmwareVersion 은 데이터시트의 알려진 프레임과 같다", () => {
    expect(toHex(buildFrame([CMD.GetFirmwareVersion]))).toBe("0000FF02FED402 2A00".replace(/\s/g, ""));
  });

  it("InListPassiveTarget(1장, 106kbps A)", () => {
    expect(toHex(buildFrame([0x4a, 0x01, 0x00]))).toBe("0000FF04FCD44A01 00E100".replace(/\s/g, ""));
  });

  it("길이가 0 이거나 254 를 넘으면 거절", () => {
    expect(() => buildFrame([])).toThrow(RangeError);
    expect(() => buildFrame(new Array(255).fill(1))).toThrow(RangeError);
  });
});

describe("FrameReader", () => {
  it("ACK 를 알아본다", () => {
    expect(new FrameReader().push(ACK)).toEqual([{ kind: "ack" }]);
  });

  it("ACK 와 응답이 한꺼번에 와도 둘 다 꺼낸다", () => {
    const frames = new FrameReader().push(b("0000FF00FF00 0000FF06FAD503 32010607 E800".replace(/\s/g, "")));
    expect(frames.map((f) => f.kind)).toEqual(["ack", "data"]);
  });

  it("한 바이트씩 나뉘어 와도 이어 붙인다", () => {
    const r = new FrameReader();
    const all = b("0000FF06FAD50332010607E800");
    const out = [];
    for (const byte of all) out.push(...r.push(Buffer.from([byte])));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "data", tfi: 0xd5 });
    expect(r.pending).toBeLessThanOrEqual(1); // 끝의 후행 00 한 바이트는 남을 수 있다 (다음 시작 코드 찾기에서 건너뛴다)
  });

  it("앞에 쓰레기 바이트가 있어도 시작 코드부터 읽는다", () => {
    const out = new FrameReader().push(b("55 AA 0000FF06FAD50332010607E800"));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("data");
  });

  it("길이 체크섬이 틀리면 invalid, 이어지는 정상 프레임은 읽는다", () => {
    const out = new FrameReader().push(b("0000FF06FBD50332010607E800 0000FF00FF00"));
    expect(out[0].kind).toBe("invalid");
    expect(out.at(-1)).toEqual({ kind: "ack" });
  });

  it("데이터 체크섬이 틀리면 invalid", () => {
    const out = new FrameReader().push(b("0000FF06FAD50332010607E900"));
    expect(out[0]).toMatchObject({ kind: "invalid", reason: "데이터 체크섬 오류" });
  });

  it("잘린 프레임은 기다린다", () => {
    const r = new FrameReader();
    expect(r.push(b("0000FF06FAD503"))).toEqual([]);
    expect(r.pending).toBeGreaterThan(0);
    expect(r.push(b("32010607E800"))).toHaveLength(1);
  });

  it("오류 프레임(7F)", () => {
    expect(new FrameReader().push(b("0000FF01FF7F8100"))).toEqual([{ kind: "error" }]);
  });

  it("조각이 00 으로 끝나고 다음 조각이 FF 로 시작해도 시작 코드를 놓치지 않는다", () => {
    const r = new FrameReader();
    expect(r.push(b("0000"))).toEqual([]);
    expect(r.push(b("FF00FF00"))).toEqual([{ kind: "ack" }]);
  });
});

describe("parseFirmwareVersion", () => {
  it("PN532 v1.6", () => {
    expect(parseFirmwareVersion(b("03 32 01 06 07"))).toEqual({ ic: 0x32, version: 1, revision: 6, support: 7 });
  });
  it("다른 응답이면 오류", () => {
    expect(() => parseFirmwareVersion(b("4B 00"))).toThrow();
  });
});

describe("parseListPassiveTarget", () => {
  it("카드가 없으면 null", () => {
    expect(parseListPassiveTarget(b("4B 00"))).toBeNull();
  });

  it("4바이트 UID (MIFARE Classic 1K)", () => {
    const t = parseListPassiveTarget(b("4B 01 01 0004 08 04 DEADBEEF"));
    expect(t).toEqual({ uid: "DEADBEEF", atqa: "0004", sak: 0x08 });
  });

  it("7바이트 UID (NTAG)", () => {
    const t = parseListPassiveTarget(b("4B 01 01 0044 00 07 04A1B2C3D4E5F6"));
    expect(t).toEqual({ uid: "04A1B2C3D4E5F6", atqa: "0044", sak: 0 });
  });

  it("UID 길이가 이상하면 오류", () => {
    expect(() => parseListPassiveTarget(b("4B 01 01 0004 08 05 0102030405"))).toThrow();
    expect(() => parseListPassiveTarget(b("4B 01 01 0004 08 04 DEAD"))).toThrow();
  });
});
