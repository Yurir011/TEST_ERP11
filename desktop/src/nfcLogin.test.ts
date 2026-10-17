import { describe, expect, it } from "vitest";

import { type SecretStore, loadOrCreateDeviceKey, verifySignature } from "./device";
import { loginMessage, performNfcLogin } from "./nfcLogin";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const store: SecretStore = { available: () => false, encrypt: (b) => b, decrypt: (b) => b };
const key = loadOrCreateDeviceKey(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bench-nl-")), "k.json"), store);

type Call = { url: string; body: Record<string, string> };

/** 가짜 서버: challenge 는 nonce 를 주고, login 은 서명을 실제로 확인한다 */
function fakeServer(opts: { challenge?: [number, unknown]; login?: [number, unknown] } = {}) {
  const calls: Call[] = [];
  const nonce = "0123456789abcdef0123456789abcdef";
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    if (url.endsWith("/challenge")) {
      const [status, json] = opts.challenge ?? [200, { nonce, expires_in: 60 }];
      return new Response(JSON.stringify(json), { status });
    }
    const [status, json] = opts.login ?? [200, { access_token: "tok-123", token_type: "bearer" }];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, nonce };
}

describe("loginMessage", () => {
  it("서버와 같은 형식이다 (backend nfc_signature.login_message)", () => {
    expect(loginMessage("abc", "0B9F515D").toString()).toBe("bench-nfc-login|abc|0B9F515D");
  });
});

describe("performNfcLogin", () => {
  it("확인값을 받아 서명하고 토큰을 돌려준다", async () => {
    const srv = fakeServer();
    const r = await performNfcLogin("http://srv", key, "0B9F515D", srv.fetchImpl);
    expect(r).toEqual({ ok: true, token: "tok-123" });
    expect(srv.calls.map((c) => c.url)).toEqual(["http://srv/api/auth/nfc/challenge", "http://srv/api/auth/nfc/login"]);

    const login = srv.calls[1].body;
    expect(login).toMatchObject({ public_key: key.publicKeyHex, nonce: srv.nonce, uid: "0B9F515D" });
    // 보낸 서명은 공개키로 확인되고, 서버가 준 nonce 와 카드 번호에 묶여 있다
    expect(verifySignature(key.publicKeyHex, loginMessage(srv.nonce, "0B9F515D"), login.signature)).toBe(true);
    expect(verifySignature(key.publicKeyHex, loginMessage(srv.nonce, "0B9F625D"), login.signature)).toBe(false);
    expect(Object.keys(login).sort()).toEqual(["nonce", "public_key", "signature", "uid"]); // 비밀키는 보내지 않는다
  });

  it("승인되지 않은 기기: 서버 안내 문구를 그대로 전하고 로그인 요청은 보내지 않는다", async () => {
    const srv = fakeServer({ challenge: [403, { detail: "이 PC 는 아직 승인되지 않았습니다." }] });
    const r = await performNfcLogin("http://srv", key, "0B9F515D", srv.fetchImpl);
    expect(r).toEqual({ ok: false, error: "이 PC 는 아직 승인되지 않았습니다." });
    expect(srv.calls).toHaveLength(1);
  });

  it.each([
    [401, "등록되지 않았거나 사용할 수 없는 카드입니다."],
    [429, "카드 로그인에 여러 번 실패해 잠시 막혔습니다. 약 5분 뒤에 다시 시도해주세요."],
    [403, "비활성화된 계정입니다."],
  ])("로그인이 %i 로 거절되면 서버 문구를 전한다", async (status, detail) => {
    const srv = fakeServer({ login: [status, { detail }] });
    expect(await performNfcLogin("http://srv", key, "0B9F515D", srv.fetchImpl)).toEqual({ ok: false, error: detail });
  });

  it("문구가 없거나 형식이 다르면 기본 문구", async () => {
    const a = await performNfcLogin("http://srv", key, "0B9F515D", fakeServer({ login: [500, {}] }).fetchImpl);
    expect(a).toMatchObject({ ok: false, error: expect.stringContaining("HTTP 500") });
    const b = await performNfcLogin("http://srv", key, "0B9F515D", fakeServer({ login: [422, { detail: [{ msg: "x" }] }] }).fetchImpl);
    expect(b).toMatchObject({ ok: false, error: expect.stringContaining("HTTP 422") });
  });

  it("서버 응답이 이상하면 거절 (토큰·nonce 없음)", async () => {
    expect(await performNfcLogin("http://srv", key, "0B9F515D", fakeServer({ challenge: [200, {}] }).fetchImpl)).toMatchObject({ ok: false });
    expect(await performNfcLogin("http://srv", key, "0B9F515D", fakeServer({ login: [200, {}] }).fetchImpl)).toMatchObject({ ok: false });
  });

  it("서버에 연결할 수 없으면 안내", async () => {
    const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    expect(await performNfcLogin("http://srv", key, "0B9F515D", down)).toEqual({ ok: false, error: "서버에 연결할 수 없습니다." });
  });

  it("login 단계에서 연결이 끊겨도 안내", async () => {
    let n = 0;
    const flaky = (async () => {
      if (n++ === 0) return new Response(JSON.stringify({ nonce: "a".repeat(32) }), { status: 200 });
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await performNfcLogin("http://srv", key, "0B9F515D", flaky)).toEqual({ ok: false, error: "서버에 연결할 수 없습니다." });
  });
});
