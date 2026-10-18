import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ImapFlow } from "imapflow";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SecretStore } from "../device";
import { MailAccountStore } from "./account";
import { type FakeImap, buildRaw, startFakeImap } from "./fakeImap.testutil";
import { MailService, isDangerousFilename, safeFilename } from "./service";
import { MailStore } from "./store";
import { MailSync } from "./sync";

const NOW = new Date("2026-10-17T12:00:00Z").getTime();
const PASSWORD = "서버-비밀번호-98765";
const secrets: SecretStore = {
  available: () => true,
  encrypt: (p) => Buffer.from(Buffer.from(p).reverse().toString("hex")),
  decrypt: (c) => Buffer.from(Buffer.from(c.toString("utf8"), "hex").reverse()),
};

let server: FakeImap;
let dir: string;
let store: MailStore;
let accounts: MailAccountStore;
let service: MailService;

const input = () => ({ email: "me@test.local", username: server.user, password: server.pass, imapHost: "127.0.0.1", imapPort: server.port, smtpHost: "127.0.0.1", smtpPort: 465 });

async function setup(messages: Parameters<typeof startFakeImap>[0]) {
  server = await startFakeImap(messages);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-svc-"));
  store = new MailStore(":memory:");
  accounts = new MailAccountStore(path.join(dir, "acc.json"), secrets);
  const sync = new MailSync({ store, credentials: () => accounts.credentials(), now: () => NOW, connectOverrides: { secure: false } });
  service = new MailService({ accounts, store, sync });
}

async function flagsOnServer(uid: number): Promise<string[]> {
  const c = new ImapFlow({ host: "127.0.0.1", port: server.port, secure: false, auth: { user: server.user, pass: server.pass }, logger: false });
  await c.connect();
  const lock = await c.getMailboxLock("INBOX");
  try {
    const m = await c.fetchOne(String(uid), { flags: true }, { uid: true });
    return m ? [...(m.flags ?? [])] : [];
  } finally {
    lock.release();
    await c.logout();
  }
}

afterEach(async () => {
  store?.close();
  await server?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const msg = (opts: Parameters<typeof buildRaw>[0]) => ({ raw: buildRaw(opts), internaldate: new Date(NOW - 60_000) });

describe("계정 등록", () => {
  beforeEach(() => setup([]));

  it("접속에 성공해야 저장하고, 돌려주는 정보에는 비밀번호가 없다", async () => {
    const r = await service.saveAccount(input());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.value)).not.toContain(server.pass);
      expect(r.value.email).toBe("me@test.local");
    }
    expect(accounts.load()?.imapHost).toBe("127.0.0.1");
    expect(accounts.credentials()?.password).toBe(server.pass);
  });

  it("비밀번호가 틀리면 저장하지 않고 안내만 한다 (비밀번호는 문구에 없다)", async () => {
    const r = await service.saveAccount({ ...input(), password: PASSWORD });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("로그인에 실패");
      expect(r.error).not.toContain(PASSWORD);
    }
    expect(accounts.load()).toBeNull();
  });

  it("입력이 잘못되면 접속하지 않고 거절한다", async () => {
    const r = await service.saveAccount({ ...input(), imapHost: "bad host" });
    expect(r.ok).toBe(false);
    expect(accounts.load()).toBeNull();
  });

  it("계정을 삭제할 수 있다", async () => {
    await service.saveAccount(input());
    service.removeAccount();
    expect(service.accountInfo()).toBeNull();
  });
});

describe("메일 읽기", () => {
  beforeEach(async () => {
    await setup([
      msg({ subject: "일반 메일", fromName: "홍길동", from: "hong@test.local", to: "me@test.local", cc: "boss@test.local", text: "안녕하세요. 본문입니다." }),
      msg({ subject: "HTML 메일", html: '<p>안녕</p><script>alert(1)</script><img src="https://track.test/p.gif">' }),
      msg({
        subject: "견적서 첨부",
        html: '<p>첨부 확인</p><img src="cid:logo1">',
        attachments: [
          { filename: "견적서.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-fake-content") },
          { filename: "logo.png", contentType: "image/png", content: Buffer.from("PNGDATA"), cid: "logo1", inline: true },
        ],
      }),
    ]);
    await service.saveAccount(input());
    await service.sync("INBOX");
  });

  const idOf = (subject: string) => service.list("INBOX", 0, 50).items.find((m) => m.subject === subject)!.id;

  it("목록에 한글 제목과 보낸 사람이 나온다", () => {
    const { items, total } = service.list("INBOX", 0, 50);
    expect(total).toBe(3);
    expect(items.map((m) => m.subject).sort()).toEqual(["HTML 메일", "견적서 첨부", "일반 메일"]);
    expect(items.find((m) => m.subject === "일반 메일")!.fromName).toBe("홍길동");
  });

  it("본문을 열면 텍스트·참조·받는 사람이 나오고 읽음으로 바뀐다 (서버에도 반영)", async () => {
    const id = idOf("일반 메일");
    expect(store.get(id)!.seen).toBe(false);
    const r = await service.get(id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toContain("본문입니다");
    expect(r.value.cc).toContain("boss@test.local");
    expect(r.value.to).toContain("me@test.local");
    expect(r.value.seen).toBe(true);
    expect(store.get(id)!.seen).toBe(true);
    expect(await flagsOnServer(store.get(id)!.uid)).toContain("\\Seen");
    expect(service.folders().find((f) => f.path === "INBOX")!.unread).toBe(2);
  });

  it("HTML 메일은 스크립트와 원격 이미지를 걸러 주고, 허용하면 이미지를 보여 준다", async () => {
    const id = idOf("HTML 메일");
    const blocked = await service.get(id);
    expect(blocked.ok && blocked.value.html).toBeTruthy();
    if (blocked.ok) {
      expect(blocked.value.html).toContain("안녕");
      expect(blocked.value.html).not.toMatch(/script|alert|track\.test/);
      expect(blocked.value.remoteImagesBlocked).toBe(true);
    }
    const allowed = await service.get(id, { allowRemoteImages: true });
    expect(allowed.ok && allowed.value.html).toContain("track.test");
  });

  it("본문 속 cid 이미지는 data 주소로 바꿔 보여 주고, 첨부 목록에는 일반 첨부만 나온다", async () => {
    const r = await service.get(idOf("견적서 첨부"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.html).toContain("data:image/png;base64,");
    expect(r.value.html).not.toContain("cid:");
    expect(r.value.attachments).toEqual([{ index: 0, filename: "견적서.pdf", contentType: "application/pdf", size: 17 }]);
  });

  it("본문은 한 번 받으면 저장해 두고, 서버에서 사라져도 다시 읽을 수 있다", async () => {
    const id = idOf("일반 메일");
    await service.get(id);
    await server.close();
    const again = await service.get(id);
    expect(again.ok && again.value.text).toContain("본문입니다");
    server = await startFakeImap([]); // afterEach 용
  });

  it("첨부 파일을 지정한 위치에 저장한다", async () => {
    const id = idOf("견적서 첨부");
    await service.get(id);
    const dest = path.join(dir, "받은견적서.pdf");
    const r = await service.writeAttachment(id, 0, dest);
    expect(r).toEqual({ ok: true, value: { filename: "견적서.pdf" } });
    expect(fs.readFileSync(dest, "utf8")).toBe("%PDF-fake-content");
  });

  it("없는 첨부 번호나 없는 메일은 안내 문구를 돌려준다", async () => {
    const id = idOf("견적서 첨부");
    const bad = await service.writeAttachment(id, 5, path.join(dir, "x"));
    expect(bad).toMatchObject({ ok: false });
    expect(fs.existsSync(path.join(dir, "x"))).toBe(false);
    expect(await service.get(99999)).toMatchObject({ ok: false, error: "메일을 찾을 수 없습니다." });
  });

  it("안 읽음·검색 조건으로 목록을 거른다 (전체메일 포함)", async () => {
    await service.get(idOf("일반 메일"));
    expect(service.list("INBOX", 0, 50, { unread: true }).items).toHaveLength(2);
    expect(service.list("INBOX", 0, 50, { attachment: true }).items.map((m) => m.subject)).toEqual(["견적서 첨부"]);
    expect(service.list("INBOX", 0, 50, { query: "html" }).total).toBe(1);
    expect(service.list("*", 0, 50, { unread: true }).total).toBe(2);
    // 알 수 없는 값은 무시한다
    expect(service.list("INBOX", 0, 50, { unread: "yes" as unknown as boolean }).total).toBe(3);
  });

  it("별표를 바꾸면 로컬과 서버에 모두 반영된다", async () => {
    const id = idOf("일반 메일");
    await service.setFlagged(id, true);
    expect(store.get(id)!.flagged).toBe(true);
    expect(await flagsOnServer(store.get(id)!.uid)).toContain("\\Flagged");
    expect(service.list("INBOX", 0, 50, { flagged: true }).items.map((m) => m.id)).toEqual([id]);
    await service.setFlagged(id, false);
    expect(await flagsOnServer(store.get(id)!.uid)).not.toContain("\\Flagged");
  });

  it("전체메일 동기화(*)는 모든 폴더를 받는다", async () => {
    const r = await service.sync("*");
    expect(r.ok).toBe(true);
  });

  it("목록 요청의 숫자는 범위를 벗어나도 안전하게 보정된다", () => {
    expect(service.list("INBOX", -5, 100000).items.length).toBe(3);
    expect(service.list("INBOX", Number.NaN, Number.NaN).items.length).toBe(3);
  });
});

describe("파일 이름 규칙", () => {
  it("실행 파일 확장자를 위험으로 본다 (이중 확장자 포함, 대소문자 무시)", () => {
    for (const n of ["a.exe", "B.BAT", "문서.pdf.exe", "run.ps1", "x.scr", "sh.lnk", "a.jar", "a.vbs"]) expect(isDangerousFilename(n), n).toBe(true);
    for (const n of ["견적서.pdf", "a.xlsx", "사진.jpg", "exe", "readme"]) expect(isDangerousFilename(n), n).toBe(false);
  });

  it("저장 이름에서 경로와 금지 문자를 없앤다", () => {
    expect(safeFilename("../../Windows/system32/evil.dll")).toBe("evil.dll");
    expect(safeFilename("C:\\Users\\a\\b.txt")).toBe("b.txt");
    expect(safeFilename('a<b>c:d"e|f?g*.txt')).toBe("a_b_c_d_e_f_g_.txt");
    expect(safeFilename("")).toBe("attachment");
    expect(safeFilename("..")).toBe("attachment");
    expect(safeFilename("끝에점. ")).toBe("끝에점");
  });
});
