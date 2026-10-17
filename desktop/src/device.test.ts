import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type SecretStore, loadOrCreateDeviceKey, registerDevice, verifySignature } from "./device";

/** 시험용 보안 저장소: 바이트를 뒤집어 "암호화된" 것처럼 만든다 */
const fakeStore = (available = true): SecretStore => ({
  available: () => available,
  encrypt: (b) => Buffer.from(b).reverse(),
  decrypt: (b) => Buffer.from(b).reverse(),
});

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bench-dev-")), "sub", "device.json");

describe("loadOrCreateDeviceKey", () => {
  it("처음에는 만들고, 다음부터는 같은 키를 읽는다", () => {
    const file = tmpFile();
    const a = loadOrCreateDeviceKey(file, fakeStore());
    const b = loadOrCreateDeviceKey(file, fakeStore());
    expect(a.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(b.publicKeyHex).toBe(a.publicKeyHex);
  });

  it("서명은 공개키로 확인되고, 다른 메시지·다른 키로는 확인되지 않는다", () => {
    const key = loadOrCreateDeviceKey(tmpFile(), fakeStore());
    const other = loadOrCreateDeviceKey(tmpFile(), fakeStore());
    const msg = Buffer.from("nonce-1|0B9F515D");
    const sig = key.sign(msg);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifySignature(key.publicKeyHex, msg, sig)).toBe(true);
    expect(verifySignature(key.publicKeyHex, Buffer.from("nonce-2|0B9F515D"), sig)).toBe(false);
    expect(verifySignature(other.publicKeyHex, msg, sig)).toBe(false);
  });

  it("비밀키는 파일에 암호화되어 저장되고 공개키·비밀키가 평문으로 노출되지 않는다", () => {
    const file = tmpFile();
    const key = loadOrCreateDeviceKey(file, fakeStore());
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(saved.encrypted).toBe(true);
    // 저장 값을 복호화 없이 그대로 키로 쓸 수 없다 (뒤집힌 상태)
    const plain = Buffer.from(saved.privateKey, "base64").reverse();
    expect(plain.subarray(0, 4).toString("hex")).toBe("302e0201"); // PKCS#8 DER 시작
    expect(Buffer.from(saved.privateKey, "base64").subarray(0, 4).toString("hex")).not.toBe("302e0201");
    expect(saved.publicKey).toBe(key.publicKeyHex);
  });

  it("보안 저장소가 없으면 암호화 없이 저장하되 같은 키를 다시 읽는다", () => {
    const file = tmpFile();
    const a = loadOrCreateDeviceKey(file, fakeStore(false));
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).encrypted).toBe(false);
    expect(loadOrCreateDeviceKey(file, fakeStore(false)).publicKeyHex).toBe(a.publicKeyHex);
  });

  it("파일이 깨졌으면 새 키를 만든다", () => {
    const file = tmpFile();
    const a = loadOrCreateDeviceKey(file, fakeStore());
    fs.writeFileSync(file, "{broken");
    const b = loadOrCreateDeviceKey(file, fakeStore());
    expect(b.publicKeyHex).not.toBe(a.publicKeyHex);
    expect(loadOrCreateDeviceKey(file, fakeStore()).publicKeyHex).toBe(b.publicKeyHex);
  });

  it("공개키가 파일과 맞지 않으면(바꿔치기) 새 키를 만든다", () => {
    const file = tmpFile();
    const a = loadOrCreateDeviceKey(file, fakeStore());
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    saved.publicKey = "00".repeat(32);
    fs.writeFileSync(file, JSON.stringify(saved));
    expect(loadOrCreateDeviceKey(file, fakeStore()).publicKeyHex).not.toBe(a.publicKeyHex);
  });
});

describe("registerDevice", () => {
  const key = { publicKeyHex: "ab".repeat(32), sign: () => "" };
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  it("서버 상태를 돌려준다", async () => {
    for (const s of ["pending", "approved", "revoked"] as const) {
      expect(await registerDevice("http://x", key, "PC", respond(200, { status: s }))).toEqual({ ok: true, status: s });
    }
  });

  it("공개키와 이름만 보낸다 (비밀키·서명은 보내지 않는다)", async () => {
    let sent: { url: string; body: string } | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body) };
      return new Response('{"status":"pending"}', { status: 200 });
    }) as unknown as typeof fetch;
    await registerDevice("http://x", key, "사무실 PC", spy);
    expect(sent!.url).toBe("http://x/api/devices/register");
    expect(JSON.parse(sent!.body)).toEqual({ name: "사무실 PC", public_key: "ab".repeat(32) });
  });

  it("오류 처리", async () => {
    expect(await registerDevice("http://x", key, "PC", respond(429, {}))).toMatchObject({ ok: false, error: expect.stringContaining("너무 많습니다") });
    expect(await registerDevice("http://x", key, "PC", respond(500, {}))).toMatchObject({ ok: false });
    expect(await registerDevice("http://x", key, "PC", respond(200, { status: "weird" }))).toMatchObject({ ok: false });
    const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    expect(await registerDevice("http://x", key, "PC", down)).toMatchObject({ ok: false, error: expect.stringContaining("연결할 수 없습니다") });
  });
});
