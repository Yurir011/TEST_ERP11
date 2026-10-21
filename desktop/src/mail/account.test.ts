import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SecretStore } from "../device";
import { MailAccountStore, validateAccountInput } from "./account";

const valid = { email: "hong@bench.co.kr", password: "비밀번호-1234", imapHost: "imap.daum.net", imapPort: 993, smtpHost: "smtp.daum.net", smtpPort: 465 };

/** 암호화 흉내: 뒤집어서 base64 비슷하게 바꾼다 (평문이 파일에 남지 않는지 확인용) */
function fakeSecrets(available = true): SecretStore {
  return {
    available: () => available,
    encrypt: (plain) => Buffer.from(Buffer.from(plain).reverse().toString("hex"), "utf8"),
    decrypt: (cipher) => Buffer.from(Buffer.from(cipher.toString("utf8"), "hex").reverse()),
  };
}

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-acc-"));
  file = path.join(dir, "mail-account.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("validateAccountInput", () => {
  it("올바른 입력은 통과하고 아이디가 없으면 이메일을 쓴다", () => {
    const r = validateAccountInput(valid);
    expect(r.ok && r.value.username).toBe("hong@bench.co.kr");
  });

  it.each([
    [{ email: "잘못" }, "이메일"],
    [{ email: "a@b" }, "이메일"],
    [{ imapHost: "bad host" }, "IMAP"],
    [{ smtpHost: "a/b" }, "SMTP"],
    [{ imapPort: 0 }, "IMAP 포트"],
    [{ smtpPort: 70000 }, "SMTP 포트"],
    [{ imapPort: "abc" }, "IMAP 포트"],
    [{ password: "" }, "비밀번호"],
    [{ password: "a\nb" }, "비밀번호"],
    [{ username: "x\r\ny" }, "아이디"],
    [{ email: "a@b.co\r\nBcc: x@y.z" }, "이메일"],
  ])("잘못된 입력을 거절한다 %j", (patch, word) => {
    const r = validateAccountInput({ ...valid, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(word);
  });

  it("암호화 방식은 ssl 이 기본이고 starttls 를 고를 수 있다", () => {
    const def = validateAccountInput(valid);
    expect(def.ok && def.value.imapSecurity).toBe("ssl");
    expect(def.ok && def.value.smtpSecurity).toBe("ssl");
    const tls = validateAccountInput({ ...valid, imapPort: 143, imapSecurity: "starttls", smtpPort: 587, smtpSecurity: "starttls" });
    expect(tls.ok && [tls.value.imapSecurity, tls.value.smtpSecurity]).toEqual(["starttls", "starttls"]);
    const odd = validateAccountInput({ ...valid, imapSecurity: "none", smtpSecurity: 5 }); // 알 수 없는 값은 ssl 로 본다
    expect(odd.ok && [odd.value.imapSecurity, odd.value.smtpSecurity]).toEqual(["ssl", "ssl"]);
  });

  it("객체가 아니면 거절한다", () => {
    expect(validateAccountInput(null).ok).toBe(false);
    expect(validateAccountInput("x").ok).toBe(false);
  });
});

describe("MailAccountStore", () => {
  it("저장한 계정을 비밀번호 없이 읽고, 접속용으로는 비밀번호를 복호화해 준다", () => {
    const store = new MailAccountStore(file, fakeSecrets());
    const v = validateAccountInput(valid);
    if (!v.ok) throw new Error("검증 실패");
    expect(store.save(v.value)).toEqual({ ok: true });

    const info = store.load()!;
    expect(info.email).toBe("hong@bench.co.kr");
    expect("password" in info).toBe(false);
    expect("passwordEnc" in info).toBe(false);

    expect(store.credentials()!.password).toBe("비밀번호-1234");
  });

  it("파일에 비밀번호가 평문으로 남지 않는다", () => {
    const store = new MailAccountStore(file, fakeSecrets());
    const v = validateAccountInput(valid);
    if (!v.ok) throw new Error("검증 실패");
    store.save(v.value);
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toContain("비밀번호-1234");
    expect(content).not.toContain(Buffer.from("비밀번호-1234").toString("base64"));
  });

  it("암호화를 쓸 수 없으면 저장을 거부하고 파일도 만들지 않는다", () => {
    const store = new MailAccountStore(file, fakeSecrets(false));
    const v = validateAccountInput(valid);
    if (!v.ok) throw new Error("검증 실패");
    const r = store.save(v.value);
    expect(r.ok).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("복호화할 수 없는 경우(다른 Windows 계정 등)에는 null 을 돌려준다", () => {
    const writer = new MailAccountStore(file, fakeSecrets());
    const v = validateAccountInput(valid);
    if (!v.ok) throw new Error("검증 실패");
    writer.save(v.value);
    const broken: SecretStore = { available: () => true, encrypt: () => Buffer.alloc(0), decrypt: () => { throw new Error("DPAPI 실패"); } };
    const reader = new MailAccountStore(file, broken);
    expect(reader.credentials()).toBeNull();
    expect(reader.load()?.email).toBe("hong@bench.co.kr"); // 설정은 보이되 비밀번호만 못 푼다
  });

  it("삭제하면 계정이 없어진다", () => {
    const store = new MailAccountStore(file, fakeSecrets());
    const v = validateAccountInput(valid);
    if (!v.ok) throw new Error("검증 실패");
    store.save(v.value);
    store.remove();
    expect(store.load()).toBeNull();
    expect(store.credentials()).toBeNull();
  });

  it("암호화 방식을 저장하고 읽는다. 예전에 저장한 파일(방식 없음)은 ssl 로 읽는다", () => {
    const store = new MailAccountStore(file, fakeSecrets());
    const v = validateAccountInput({ ...valid, smtpPort: 587, smtpSecurity: "starttls" });
    if (!v.ok) throw new Error("검증 실패");
    store.save(v.value);
    expect(store.load()).toMatchObject({ imapSecurity: "ssl", smtpSecurity: "starttls" });
    expect(store.credentials()).toMatchObject({ smtpSecurity: "starttls" });
    // 방식이 없던 옛 파일
    const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
    delete legacy.imapSecurity;
    delete legacy.smtpSecurity;
    fs.writeFileSync(file, JSON.stringify(legacy));
    expect(store.load()).toMatchObject({ imapSecurity: "ssl", smtpSecurity: "ssl" });
  });

  it("파일이 없거나 손상되면 null", () => {
    const store = new MailAccountStore(file, fakeSecrets());
    expect(store.load()).toBeNull();
    fs.writeFileSync(file, "{깨진 json");
    expect(store.load()).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ email: 1 }));
    expect(store.load()).toBeNull();
  });
});
