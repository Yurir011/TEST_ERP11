import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ImapFlow } from "imapflow";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SecretStore } from "../device";
import { MailAccountStore } from "./account";
import { MAX_ATTACHMENT_BYTES, MailComposer, type SendPayload, prefixSubject } from "./compose";
import { type FakeImap, buildRaw, startFakeImap } from "./fakeImap.testutil";
import { type FakeSmtp, startFakeSmtp } from "./fakeSmtp.testutil";
import { MailSender } from "./send";
import { MailStore } from "./store";
import { MailSync } from "./sync";

const NOW = new Date("2026-10-17T12:00:00Z").getTime();
const secrets: SecretStore = {
  available: () => true,
  encrypt: (p) => Buffer.from(Buffer.from(p).reverse().toString("hex")),
  decrypt: (c) => Buffer.from(Buffer.from(c.toString("utf8"), "hex").reverse()),
};

let imap: FakeImap;
let smtp: FakeSmtp;
let dir: string;
let store: MailStore;
let accounts: MailAccountStore;
let composer: MailComposer;
let sync: MailSync;

const ORIGINAL_ID = "<original-123@sender.test>";

async function setup(options: { saveToSent?: boolean; sentFolder?: boolean; messages?: Parameters<typeof startFakeImap>[0] } = {}) {
  imap = await startFakeImap(
    options.messages ?? [
      {
        raw: buildRaw({
          subject: "견적 문의",
          fromName: "김영업",
          from: "kim@sender.test",
          to: "me@bench.co.kr, other@bench.co.kr",
          cc: "boss@bench.co.kr",
          text: "안녕하세요.\n견적서 부탁드립니다.",
          attachments: [{ filename: "요청서.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-request") }],
        }).replace(/Message-ID: <[^>]+>/, `Message-ID: ${ORIGINAL_ID}`),
        internaldate: new Date(NOW - 3_600_000),
      },
    ],
    options.sentFolder === false ? {} : { Sent: "\\Sent" },
  );
  smtp = await startFakeSmtp({ secure: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-compose-"));
  store = new MailStore(":memory:");
  accounts = new MailAccountStore(path.join(dir, "acc.json"), secrets);
  const v = { email: "me@bench.co.kr", username: imap.user, password: imap.pass, imapHost: "127.0.0.1", imapPort: imap.port, smtpHost: "127.0.0.1", smtpPort: smtp.port, saveToSent: options.saveToSent === true };
  accounts.save(v);
  sync = new MailSync({ store, credentials: () => accounts.credentials(), now: () => NOW, connectOverrides: { secure: false } });
  const sender = new MailSender({ credentials: () => accounts.credentials(), transportOverrides: { tls: { ca: smtp.ca } } });
  composer = new MailComposer({ accounts, store, sync, sender, tempDir: path.join(dir, "tmp") });
  await sync.syncFolder("INBOX");
}

const originalId = () => store.list("INBOX", 1, 0)[0].id;

const payload = (over: Partial<SendPayload> = {}): SendPayload => ({
  fromName: "박소장",
  to: "kim@sender.test",
  cc: "",
  bcc: "",
  subject: "테스트",
  body: "본문입니다",
  attachmentIds: [],
  ...over,
});

async function countInSent(): Promise<number> {
  const c = new ImapFlow({ host: "127.0.0.1", port: imap.port, secure: false, auth: { user: imap.user, pass: imap.pass }, logger: false });
  await c.connect();
  try {
    const lock = await c.getMailboxLock("Sent");
    try {
      let n = 0;
      if (c.mailbox && typeof c.mailbox === "object" && c.mailbox.exists === 0) return 0;
      for await (const _m of c.fetch("1:*", { uid: true })) {
        void _m;
        n++;
      }
      return n;
    } finally {
      lock.release();
    }
  } finally {
    await c.logout();
  }
}

afterEach(async () => {
  store?.close();
  await imap?.close();
  await smtp?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("제목 접두사", () => {
  it("Re:/Fwd: 를 한 번만 붙인다", () => {
    expect(prefixSubject("견적", "Re: ")).toBe("Re: 견적");
    expect(prefixSubject("Re: 견적", "Re: ")).toBe("Re: 견적");
    expect(prefixSubject("RE: 견적", "Re: ")).toBe("RE: 견적");
    expect(prefixSubject("회신: 견적", "Re: ")).toBe("회신: 견적");
    expect(prefixSubject("견적", "Fwd: ")).toBe("Fwd: 견적");
    expect(prefixSubject("Fwd: 견적", "Fwd: ")).toBe("Fwd: 견적");
    expect(prefixSubject("전달: 견적", "Fwd: ")).toBe("전달: 견적");
  });
});

describe("초안", () => {
  beforeEach(() => setup());

  it("내게쓰기는 받는 사람이 내 주소다", async () => {
    const r = await composer.draft("self");
    expect(r).toMatchObject({ ok: true, value: { to: "me@bench.co.kr", subject: "", body: "" } });
  });

  it("답장: 보낸 사람에게, 제목 Re:, 본문 인용, 대화 이어 붙이기 정보", async () => {
    const r = await composer.draft("reply", originalId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.to).toBe("김영업 <kim@sender.test>");
    expect(r.value.cc).toBe("");
    expect(r.value.subject).toBe("Re: 견적 문의");
    expect(r.value.body).toContain("김영업");
    expect(r.value.body).toContain("> 견적서 부탁드립니다.");
    expect(r.value.threading).toEqual({ inReplyTo: ORIGINAL_ID, references: [ORIGINAL_ID] });
    expect(r.value.attachments).toEqual([]);
  });

  it("전체 답장: 받는 사람·참조에서 나와 보낸 사람(중복)을 뺀 나머지가 참조에 들어간다", async () => {
    const r = await composer.draft("replyAll", originalId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.to).toBe("김영업 <kim@sender.test>");
    expect(r.value.cc.split(", ").sort()).toEqual(["boss@bench.co.kr", "other@bench.co.kr"]);
    expect(r.value.cc).not.toContain("me@bench.co.kr");
  });

  it("전달: 제목 Fwd:, 원본 정보가 본문에, 원본 첨부가 준비된다", async () => {
    const r = await composer.draft("forward", originalId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.to).toBe("");
    expect(r.value.subject).toBe("Fwd: 견적 문의");
    expect(r.value.body).toContain("전달된 메일");
    expect(r.value.body).toContain("제목: 견적 문의");
    expect(r.value.body).toContain("견적서 부탁드립니다.");
    expect(r.value.attachments).toHaveLength(1);
    expect(r.value.attachments[0]).toMatchObject({ filename: "요청서.pdf", size: 12 });
  });

  it("원본이 없으면 안내한다", async () => {
    expect(await composer.draft("reply", 9999)).toMatchObject({ ok: false });
    expect(await composer.draft("reply")).toMatchObject({ ok: false });
  });
});

describe("첨부 파일 준비", () => {
  beforeEach(() => setup());

  it("사용자가 고른 파일을 준비하고, 없는 파일·폴더는 거절한다", () => {
    const f = path.join(dir, "자료.txt");
    fs.writeFileSync(f, "hello");
    const ok = composer.stageFiles([f]);
    expect(ok.ok && ok.value[0]).toMatchObject({ filename: "자료.txt", size: 5 });
    expect(composer.stageFiles([path.join(dir, "없음.txt")]).ok).toBe(false);
    expect(composer.stageFiles([dir]).ok).toBe(false);
  });

  it("너무 큰 파일은 거절한다", () => {
    const f = path.join(dir, "big.bin");
    fs.writeFileSync(f, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
    const r = composer.stageFiles([f]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("너무 큽니다");
  });
});

describe("보내기", () => {
  beforeEach(() => setup());

  it("본문·첨부·받는 사람(참조·숨은참조)을 보내고, 중복 주소는 받는 사람 칸을 우선한다", async () => {
    const f = path.join(dir, "견적서.xlsx");
    fs.writeFileSync(f, "xlsx-data");
    const staged = composer.stageFiles([f]);
    if (!staged.ok) throw new Error("준비 실패");
    const r = await composer.send(payload({ to: "kim@sender.test", cc: "KIM@sender.test, cc@x.test", bcc: "hidden@x.test, cc@x.test", attachmentIds: [staged.value[0].id] }));
    expect(r.ok).toBe(true);
    const got = smtp.messages[0];
    expect(got.envelope.to.sort()).toEqual(["cc@x.test", "hidden@x.test", "kim@sender.test"]);
    expect(got.parsed.attachments[0].filename).toBe("견적서.xlsx");
    expect(got.parsed.attachments[0].content.toString()).toBe("xlsx-data");
    expect(got.raw.toString()).not.toContain("hidden@x.test");
    expect(fs.existsSync(f)).toBe(true); // 사용자가 고른 원본 파일은 지우지 않는다
  });

  it("답장이면 대화 이어 붙이기(In-Reply-To·References)가 실린다", async () => {
    const draft = await composer.draft("reply", originalId());
    if (!draft.ok) throw new Error("초안 실패");
    const r = await composer.send(payload({ to: draft.value.to, subject: draft.value.subject, body: draft.value.body, threading: draft.value.threading }));
    expect(r.ok).toBe(true);
    expect(smtp.messages[0].parsed.inReplyTo).toBe(ORIGINAL_ID);
    expect([smtp.messages[0].parsed.references].flat()).toEqual([ORIGINAL_ID]);
  });

  it("전달하면 원본 첨부가 함께 가고, 보낸 뒤 임시 파일은 지워진다", async () => {
    const draft = await composer.draft("forward", originalId());
    if (!draft.ok) throw new Error("초안 실패");
    const tmpFile = (): string[] => (fs.existsSync(path.join(dir, "tmp")) ? fs.readdirSync(path.join(dir, "tmp")) : []);
    expect(tmpFile()).toHaveLength(1);
    const r = await composer.send(payload({ to: "dest@x.test", subject: draft.value.subject, body: draft.value.body, attachmentIds: draft.value.attachments.map((a) => a.id) }));
    expect(r.ok).toBe(true);
    expect(smtp.messages[0].parsed.attachments[0].filename).toBe("요청서.pdf");
    expect(smtp.messages[0].parsed.attachments[0].content.toString()).toBe("%PDF-request");
    expect(tmpFile()).toHaveLength(0);
  });

  it("준비를 버리면 임시 파일이 지워진다", async () => {
    const draft = await composer.draft("forward", originalId());
    if (!draft.ok) throw new Error("초안 실패");
    composer.discard(draft.value.attachments.map((a) => a.id));
    expect(fs.readdirSync(path.join(dir, "tmp"))).toHaveLength(0);
    const r = await composer.send(payload({ attachmentIds: draft.value.attachments.map((a) => a.id) }));
    expect(r.ok).toBe(false); // 버린 첨부는 쓸 수 없다
  });

  it("제목의 줄바꿈은 한 줄로 합쳐져 헤더 끼워 넣기가 되지 않는다", async () => {
    const r = await composer.send(payload({ subject: "정상 제목\r\nBcc: evil@x.test\r\nX-Evil: 1" }));
    expect(r.ok).toBe(true);
    const got = smtp.messages[0];
    expect(got.parsed.subject).toBe("정상 제목 Bcc: evil@x.test X-Evil: 1");
    expect(got.raw.toString()).not.toMatch(/^Bcc:/im);
    expect(got.raw.toString()).not.toMatch(/^X-Evil:/im);
    expect(got.envelope.to).toEqual(["kim@sender.test"]);
  });

  it("보내는 사람 이름의 특수 문자도 안전하게 처리된다", async () => {
    await composer.send(payload({ fromName: '박"소장" <evil@x.test>\r\nBcc: z@x.test' }));
    const got = smtp.messages[0];
    expect(got.raw.toString()).not.toMatch(/^Bcc:/im);
    expect(got.parsed.from?.value[0].address).toBe("me@bench.co.kr");
  });

  it("제목이 비면 (제목 없음)으로 보낸다", async () => {
    await composer.send(payload({ subject: "   " }));
    expect(smtp.messages[0].parsed.subject).toBe("(제목 없음)");
  });

  it.each([
    ["받는 사람 없음", { to: "", cc: "", bcc: "" }, "받는 사람"],
    ["잘못된 주소", { to: "not-an-email" }, "올바르지 않은"],
    ["줄바꿈 공격", { to: "a@b.co\r\nBcc: z@x.test" }, "올바르지 않은"],
    ["너무 많은 사람", { to: Array.from({ length: 51 }, (_, i) => `u${i}@x.test`).join(",") }, "50명"],
    ["본문 너무 김", { body: "가".repeat(1_000_001) }, "본문이 너무"],
    ["없는 첨부 번호", { attachmentIds: ["없는-번호"] }, "첨부 파일을 찾을 수 없습니다"],
  ] as const)("보내기 전에 막는다: %s", async (_name, over, word) => {
    const r = await composer.send(payload(over as Partial<SendPayload>));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(word);
    expect(smtp.messages).toHaveLength(0);
  });

  it("서버가 거절하면 안내하고, 첨부 준비는 남겨 다시 보낼 수 있다", async () => {
    const f = path.join(dir, "a.txt");
    fs.writeFileSync(f, "x");
    const staged = composer.stageFiles([f]);
    if (!staged.ok) throw new Error("준비 실패");
    accounts.save({ email: "me@bench.co.kr", username: "testuser", password: "틀린비밀번호", imapHost: "127.0.0.1", imapPort: imap.port, smtpHost: "127.0.0.1", smtpPort: smtp.port, saveToSent: false });
    const r = await composer.send(payload({ attachmentIds: [staged.value[0].id] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("로그인에 실패");
      expect(r.error).not.toContain("틀린비밀번호");
    }
    // 계정을 고친 뒤 같은 첨부로 다시 보낼 수 있다
    accounts.save({ email: "me@bench.co.kr", username: "testuser", password: "testpass", imapHost: "127.0.0.1", imapPort: imap.port, smtpHost: "127.0.0.1", smtpPort: smtp.port, saveToSent: false });
    const again = await composer.send(payload({ attachmentIds: [staged.value[0].id] }));
    expect(again.ok).toBe(true);
  });

  it("보낸메일함 저장 설정이 꺼져 있으면 저장하지 않는다 (결과는 null)", async () => {
    const r = await composer.send(payload());
    expect(r).toMatchObject({ ok: true, value: { savedToSent: null } });
    expect(await countInSent()).toBe(0);
  });
});

describe("보낸메일함 저장", () => {
  it("설정이 켜져 있으면 보낸 메일을 보낸메일함에 저장한다", async () => {
    await setup({ saveToSent: true });
    const r = await composer.send(payload({ subject: "저장 확인" }));
    expect(r).toMatchObject({ ok: true, value: { savedToSent: true } });
    expect(await countInSent()).toBe(1);
  });

  it("보낸메일함 폴더가 없으면 저장하지 못했다고 알리되 메일은 보낸 것으로 처리한다", async () => {
    await setup({ saveToSent: true, sentFolder: false });
    const r = await composer.send(payload());
    expect(r).toMatchObject({ ok: true, value: { savedToSent: false } });
    expect(smtp.messages).toHaveLength(1);
  });
});
