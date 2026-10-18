import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MailCredentials } from "./account";
import { type FakeSmtp, startFakeSmtp } from "./fakeSmtp.testutil";
import { MailSender, type OutgoingMail } from "./send";
import { MailError } from "./sync";

let smtp: FakeSmtp | null = null;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-send-"));
});

afterEach(async () => {
  await smtp?.close();
  smtp = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

function creds(over: Partial<MailCredentials> = {}): MailCredentials {
  return { email: "me@bench.co.kr", username: smtp?.user ?? "testuser", password: smtp?.pass ?? "testpass", imapHost: "127.0.0.1", imapPort: 1, smtpHost: "127.0.0.1", smtpPort: smtp?.port ?? 1, ...over };
}

const mail = (over: Partial<OutgoingMail> = {}): OutgoingMail => ({
  fromName: "박소장",
  to: [{ name: "김영업", address: "kim@test.local" }],
  cc: [],
  bcc: [],
  subject: "견적서 송부",
  text: "안녕하세요.\n견적서를 보내 드립니다.",
  attachments: [],
  ...over,
});

/** 서버 인증서를 믿게 해서(인증서 검증은 켠 채로) 가짜 암호화(SMTPS) 서버에 접속하는 보내기 도구 */
function senderFor(server: FakeSmtp, over: Partial<MailCredentials> = {}, trust = true) {
  return new MailSender({ credentials: () => creds(over), transportOverrides: trust ? { tls: { ca: server.ca } } : {} });
}

describe("메일 원문 만들기", () => {
  it("보내는 사람 이름·받는 사람·참조는 머리글에 있고, 숨은참조는 머리글에 없다", async () => {
    const sender = new MailSender({ credentials: () => creds() });
    const { raw, messageId } = await sender.build(creds(), mail({ cc: [{ name: "", address: "cc@test.local" }], bcc: [{ name: "", address: "secret@test.local" }] }));
    const text = raw.toString("utf8");
    expect(text).toMatch(/^From: .*me@bench\.co\.kr/m);
    expect(text).toMatch(/^To: .*kim@test\.local/m);
    expect(text).toMatch(/^Cc: cc@test\.local/m);
    expect(text).not.toMatch(/secret@test\.local/);
    expect(text).not.toMatch(/^Bcc:/im);
    expect(text).toContain(`Message-ID: ${messageId}`);
  });

  it("답장이면 In-Reply-To 와 References 가 붙는다", async () => {
    const sender = new MailSender({ credentials: () => creds() });
    const { raw } = await sender.build(creds(), mail({ inReplyTo: "<orig@x.co>", references: ["<a@x.co>", "<orig@x.co>"] }));
    const text = raw.toString("utf8");
    expect(text).toMatch(/^In-Reply-To: <orig@x\.co>/m);
    expect(text).toMatch(/^References: <a@x\.co> <orig@x\.co>/m);
  });
});

describe("가짜 암호화(SMTPS) 서버로 보내기", () => {
  it("한글 제목·본문·이름, 첨부 파일, 받는 사람(숨은참조 포함)이 그대로 전달된다", async () => {
    smtp = await startFakeSmtp({ secure: true });
    const file = path.join(dir, "견적서.pdf");
    fs.writeFileSync(file, "%PDF-fake");
    const sent = await senderFor(smtp).send(
      mail({ cc: [{ name: "", address: "cc@test.local" }], bcc: [{ name: "", address: "secret@test.local" }], attachments: [{ filename: "견적서.pdf", path: file }] }),
    );
    expect(smtp.messages).toHaveLength(1);
    const got = smtp.messages[0];
    expect(got.envelope.from).toBe("me@bench.co.kr");
    expect(got.envelope.to.sort()).toEqual(["cc@test.local", "kim@test.local", "secret@test.local"]);
    expect(got.parsed.subject).toBe("견적서 송부");
    expect(got.parsed.text).toContain("견적서를 보내 드립니다");
    expect(got.parsed.from?.value[0]).toMatchObject({ name: "박소장", address: "me@bench.co.kr" });
    expect(got.parsed.to).toBeTruthy();
    expect(got.parsed.attachments).toHaveLength(1);
    expect(got.parsed.attachments[0].filename).toBe("견적서.pdf");
    expect(got.parsed.attachments[0].content.toString()).toBe("%PDF-fake");
    expect(got.raw.toString()).not.toMatch(/secret@test\.local/); // 숨은참조는 받은 메일 어디에도 없다
    expect(sent.messageId).toMatch(/^<.+@bench\.co\.kr>$/);
    expect(sent.raw.length).toBeGreaterThan(100);
  });

  it("비밀번호가 틀리면 로그인 실패로 안내하고 비밀번호를 문구에 싣지 않는다", async () => {
    smtp = await startFakeSmtp({ secure: true });
    const err = await senderFor(smtp, { password: "틀린-비밀번호-777" }).send(mail()).catch((e) => e);
    expect(err).toBeInstanceOf(MailError);
    expect(err.kind).toBe("auth");
    expect(err.message).toContain("로그인에 실패");
    expect(err.message).not.toContain("틀린-비밀번호-777");
    expect(smtp.messages).toHaveLength(0);
  });

  it("서버가 받는 사람을 거절하면 주소를 확인하라고 안내한다", async () => {
    smtp = await startFakeSmtp({ secure: true, rejectRcpt: "nobody@test.local" });
    const err = await senderFor(smtp).send(mail({ to: [{ name: "", address: "nobody@test.local" }] })).catch((e) => e);
    expect(err.kind).toBe("recipient");
    expect(smtp.messages).toHaveLength(0);
  });

  it("서버 크기 한도를 넘으면 크기 문제로 안내한다", async () => {
    smtp = await startFakeSmtp({ secure: true, maxSize: 2000 });
    const file = path.join(dir, "big.bin");
    fs.writeFileSync(file, Buffer.alloc(50_000, 7));
    const err = await senderFor(smtp).send(mail({ attachments: [{ filename: "big.bin", path: file }] })).catch((e) => e);
    expect(err.kind).toBe("size");
  });

  it("서버 인증서를 믿을 수 없으면 연결을 막는다 (인증서 검증이 켜져 있다)", async () => {
    smtp = await startFakeSmtp({ secure: true });
    const err = await senderFor(smtp, {}, false).send(mail()).catch((e) => e);
    expect(err.kind).toBe("tls");
    expect(smtp.messages).toHaveLength(0);
  });

  it("서버가 없으면 연결 불가로 안내한다", async () => {
    smtp = await startFakeSmtp({ secure: true });
    const port = smtp.port;
    await smtp.close();
    const err = await new MailSender({ credentials: () => creds({ smtpPort: port }), transportOverrides: { tls: { ca: smtp.ca } } }).send(mail()).catch((e) => e);
    expect(err.kind).toBe("network");
    smtp = await startFakeSmtp({ secure: true }); // afterEach 가 닫을 수 있게
  });
});

describe("보내기 전 확인", () => {
  it("받는 사람이 없으면 보내지 않는다", async () => {
    smtp = await startFakeSmtp({ secure: true });
    const err = await senderFor(smtp).send(mail({ to: [] })).catch((e) => e);
    expect(err.kind).toBe("recipient");
    expect(smtp.messages).toHaveLength(0);
  });

  it("계정이 없으면 등록하라고 안내한다", async () => {
    const err = await new MailSender({ credentials: () => null }).send(mail()).catch((e) => e);
    expect(err.kind).toBe("config");
  });
});
