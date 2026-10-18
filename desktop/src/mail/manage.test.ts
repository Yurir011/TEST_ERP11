/** 메일 이동·삭제·스팸 신고·서버 본문 검색·새 메일 확인 (가짜 IMAP 서버) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ImapFlow } from "imapflow";
import { afterEach, describe, expect, it } from "vitest";

import type { SecretStore } from "../device";
import { MailAccountStore } from "./account";
import { type FakeImap, buildRaw, startFakeImap } from "./fakeImap.testutil";
import { MailService } from "./service";
import { MailStore } from "./store";
import { MailSync } from "./sync";
import { ALL_MAIL_FOLDER } from "./types";

const NOW = new Date("2026-10-17T12:00:00Z").getTime();
const secrets: SecretStore = {
  available: () => true,
  encrypt: (p) => Buffer.from(Buffer.from(p).reverse().toString("hex")),
  decrypt: (c) => Buffer.from(Buffer.from(c.toString("utf8"), "hex").reverse()),
};

const FOLDERS = { Sent: "\\Sent", Trash: "\\Trash", Junk: "\\Junk", Archive: "\\Archive" };

let imap: FakeImap;
let dir: string;
let store: MailStore;
let service: MailService;

const mail = (subject: string, text: string, min = 10) => ({ raw: buildRaw({ subject, text, fromName: "발신자", from: "from@test.local" }), internaldate: new Date(NOW - min * 60_000) });

/** 본문이 그대로(8bit) 들어 있는 메일: 가짜 서버의 본문 검색은 영문만 찾아 주므로 검색 시험에는 영문 단어를 섞어 쓴다 */
const plainMail = (subject: string, text: string, min = 10) => ({
  raw: ["From: =?UTF-8?B?67Cc7Iug7J6Q?= <from@test.local>", "To: me@test.local", `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`, "Date: Fri, 16 Oct 2026 09:00:00 +0900", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", text].join("\r\n"),
  internaldate: new Date(NOW - min * 60_000),
});

async function setup(folders: Record<string, string> = FOLDERS) {
  imap = await startFakeImap([plainMail("첫째 메일", "PRICELIST 본문 하나", 30), plainMail("둘째 메일", "견적서 PRICELIST 단가표를 보냅니다", 20), mail("셋째 메일", "회의 일정", 10)], folders);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-manage-"));
  store = new MailStore(":memory:");
  const accounts = new MailAccountStore(path.join(dir, "acc.json"), secrets);
  accounts.save({ email: "me@test.local", username: imap.user, password: imap.pass, imapHost: "127.0.0.1", imapPort: imap.port, smtpHost: "127.0.0.1", smtpPort: 1, saveToSent: false });
  const sync = new MailSync({ store, credentials: () => accounts.credentials(), now: () => NOW, connectOverrides: { secure: false } });
  service = new MailService({ accounts, store, sync });
  await sync.syncFolder("INBOX");
}

const idOf = (subject: string) => store.list("INBOX", 50, 0).find((m) => m.subject === subject)!.id;
const subjectsIn = (folder: string) => store.list(folder, 50, 0).map((m) => m.subject).sort();

async function serverSubjects(folder: string): Promise<string[]> {
  const c = new ImapFlow({ host: "127.0.0.1", port: imap.port, secure: false, auth: { user: imap.user, pass: imap.pass }, logger: false });
  await c.connect();
  try {
    const lock = await c.getMailboxLock(folder);
    try {
      if (c.mailbox && typeof c.mailbox === "object" && c.mailbox.exists === 0) return [];
      const out: string[] = [];
      for await (const m of c.fetch("1:*", { envelope: true })) out.push(m.envelope?.subject ?? "");
      return out.sort();
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
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("이동", () => {
  it("선택한 메일을 다른 폴더로 옮기면 서버에서도 옮겨지고, 도착 폴더에 바로 보인다", async () => {
    await setup();
    const r = await service.move([idOf("첫째 메일")], "Archive");
    expect(r).toEqual({ ok: true, value: { moved: 1 } });
    expect(subjectsIn("INBOX")).toEqual(["둘째 메일", "셋째 메일"]);
    expect(subjectsIn("Archive")).toEqual(["첫째 메일"]);
    expect(await serverSubjects("INBOX")).toEqual(["둘째 메일", "셋째 메일"]);
    expect(await serverSubjects("Archive")).toEqual(["첫째 메일"]);
  });

  it("여러 통을 한꺼번에 옮길 수 있고, 이미 그 폴더에 있는 메일은 건드리지 않는다", async () => {
    await setup();
    await service.move([idOf("첫째 메일")], "Archive");
    const archived = store.list("Archive", 5, 0)[0].id;
    const r = await service.move([archived, idOf("둘째 메일"), idOf("셋째 메일")], "Archive");
    expect(r).toEqual({ ok: true, value: { moved: 2 } });
    expect(subjectsIn("Archive")).toEqual(["둘째 메일", "셋째 메일", "첫째 메일"]);
    expect(subjectsIn("INBOX")).toEqual([]);
  });

  it("없는 폴더로는 옮기지 않는다 (메일은 그대로)", async () => {
    await setup();
    const r = await service.move([idOf("첫째 메일")], "없는폴더");
    expect(r.ok).toBe(false);
    expect(subjectsIn("INBOX")).toHaveLength(3);
  });

  it("존재하지 않는 메일 번호는 무시한다", async () => {
    await setup();
    expect(await service.move([99999], "Archive")).toEqual({ ok: true, value: { moved: 0 } });
  });
});

describe("삭제", () => {
  it("삭제하면 휴지통으로 옮긴다 (서버에서도, 되살릴 수 있다)", async () => {
    await setup();
    const r = await service.remove([idOf("둘째 메일")]);
    expect(r).toEqual({ ok: true, value: { trashed: 1, deleted: 0 } });
    expect(subjectsIn("INBOX")).toEqual(["셋째 메일", "첫째 메일"]);
    expect(subjectsIn("Trash")).toEqual(["둘째 메일"]);
    expect(await serverSubjects("Trash")).toEqual(["둘째 메일"]);
  });

  it("휴지통 폴더를 찾지 못하면 지우지 않고 알린다 (조용히 완전 삭제하지 않는다)", async () => {
    await setup({ Sent: "\\Sent" });
    const r = await service.remove([idOf("둘째 메일")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("휴지통");
    expect(await serverSubjects("INBOX")).toHaveLength(3);
  });

  it("완전 삭제는 휴지통에 있는 메일만 된다 (받은메일함 메일은 거절)", async () => {
    await setup();
    const r = await service.remove([idOf("첫째 메일")], true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("휴지통");
    expect(await serverSubjects("INBOX")).toHaveLength(3);
  });

  it("휴지통에 있는 메일을 완전 삭제하면 서버에서도 사라진다", async () => {
    await setup();
    await service.remove([idOf("첫째 메일"), idOf("둘째 메일")]);
    const trashIds = store.list("Trash", 50, 0).map((m) => m.id);
    expect(trashIds).toHaveLength(2);
    const r = await service.remove([trashIds[0]], true);
    expect(r).toEqual({ ok: true, value: { trashed: 0, deleted: 1 } });
    expect(store.count("Trash")).toBe(1);
    expect(await serverSubjects("Trash")).toHaveLength(1);
  });

  it("이미 휴지통에 있는 메일을 다시 삭제(휴지통으로)해도 아무 일도 없다", async () => {
    await setup();
    await service.remove([idOf("첫째 메일")]);
    const inTrash = store.list("Trash", 5, 0)[0].id;
    expect(await service.remove([inTrash])).toEqual({ ok: true, value: { trashed: 0, deleted: 0 } });
    expect(store.count("Trash")).toBe(1);
  });
});

describe("스팸 신고", () => {
  it("스팸메일함으로 옮긴다", async () => {
    await setup();
    const r = await service.spam([idOf("셋째 메일")]);
    expect(r).toEqual({ ok: true, value: { moved: 1 } });
    expect(subjectsIn("Junk")).toEqual(["셋째 메일"]);
    expect(await serverSubjects("Junk")).toEqual(["셋째 메일"]);
  });

  it("스팸메일함이 없으면 알리고 옮기지 않는다", async () => {
    await setup({ Sent: "\\Sent", Trash: "\\Trash" });
    const r = await service.spam([idOf("셋째 메일")]);
    expect(r.ok).toBe(false);
    expect(await serverSubjects("INBOX")).toHaveLength(3);
  });
});

describe("서버 본문 검색", () => {
  it("본문에만 있는 글도 서버가 찾아 주고, 이 PC 에 받아 둔 메일의 번호를 돌려준다", async () => {
    await setup();
    const r = await service.searchBody("INBOX", "PRICELIST");
    expect(r.ok && [...r.value.ids].sort()).toEqual([idOf("첫째 메일"), idOf("둘째 메일")].sort());
    // 목록 조건(ids)으로 좁히면 그 메일들만 나온다
    expect(service.list("INBOX", 0, 50, { ids: r.ok ? r.value.ids : [] }).items.map((m) => m.subject).sort()).toEqual(["둘째 메일", "첫째 메일"]);
  });

  it("찾는 글이 없으면 빈 결과, 빈 검색어도 빈 결과", async () => {
    await setup();
    expect(await service.searchBody("INBOX", "NOSUCHWORD")).toEqual({ ok: true, value: { ids: [] } });
    expect(await service.searchBody("INBOX", "   ")).toEqual({ ok: true, value: { ids: [] } });
    expect(service.list("INBOX", 0, 50, { ids: [] }).items).toEqual([]); // 번호가 없으면 목록도 비어야 한다
  });

  it("전체메일 검색은 휴지통·스팸을 빼고 모든 폴더를 찾는다", async () => {
    await setup();
    await service.move([idOf("둘째 메일")], "Archive");
    await service.remove([idOf("첫째 메일")]);
    const all = await service.searchBody(ALL_MAIL_FOLDER, "PRICELIST");
    expect(all.ok).toBe(true);
    const found = all.ok ? all.value.ids.map((id) => store.get(id)!.subject).sort() : [];
    expect(found).toEqual(["둘째 메일"]); // 보관함으로 옮긴 둘째 메일은 찾고, 휴지통에 있는 첫째 메일은 빠진다
  });

  it("서버에 접속하지 못하면 안내한다", async () => {
    await setup();
    await imap.close();
    const r = await service.searchBody("INBOX", "PRICELIST");
    expect(r.ok).toBe(false);
    imap = await startFakeImap([]); // afterEach 용
  });
});

describe("새 메일 확인", () => {
  async function appendToInbox(subject: string, flags: string[] = []) {
    const c = new ImapFlow({ host: "127.0.0.1", port: imap.port, secure: false, auth: { user: imap.user, pass: imap.pass }, logger: false });
    await c.connect();
    try {
      await c.append("INBOX", Buffer.from(buildRaw({ subject, fromName: "새 발신자", from: "new@test.local" })), flags, new Date(NOW - 1000));
    } finally {
      await c.logout();
    }
  }

  it("처음 등록한 직후(받은메일함이 비어 있던 첫 동기화)에는 알림을 만들지 않고, 안 읽은 수만 알려 준다", async () => {
    imap = await startFakeImap([mail("예전 메일 1", "x", 50), mail("예전 메일 2", "y", 40)], FOLDERS);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-manage-"));
    store = new MailStore(":memory:");
    const accounts = new MailAccountStore(path.join(dir, "acc.json"), secrets);
    accounts.save({ email: "me@test.local", username: imap.user, password: imap.pass, imapHost: "127.0.0.1", imapPort: imap.port, smtpHost: "127.0.0.1", smtpPort: 1, saveToSent: false });
    service = new MailService({ accounts, store, sync: new MailSync({ store, credentials: () => accounts.credentials(), now: () => NOW, connectOverrides: { secure: false } }) });
    const r = await service.pollInbox();
    expect(r).toEqual({ ok: true, value: { unread: 2, newMail: [], changed: true } });
  });

  it("새로 도착한 안 읽은 메일만 알려 주고, 읽은 표시로 도착한 메일·이미 알린 메일은 빼며, 계속 확인해도 중복으로 알리지 않는다", async () => {
    await setup();
    expect(await service.pollInbox()).toEqual({ ok: true, value: { unread: 3, newMail: [], changed: false } });

    await appendToInbox("새 메일 A");
    await appendToInbox("이미 읽은 메일 B", ["\\Seen"]);
    const r = await service.pollInbox();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.newMail).toEqual([{ id: expect.any(Number), from: "새 발신자", subject: "새 메일 A" }]);
    expect(r.value.unread).toBe(4);
    expect(r.value.changed).toBe(true);

    const again = await service.pollInbox();
    expect(again).toEqual({ ok: true, value: { unread: 4, newMail: [], changed: false } });
  });

  it("계정이 없으면 아무 일도 하지 않는다", async () => {
    await setup();
    service.removeAccount();
    expect(await service.pollInbox()).toEqual({ ok: true, value: { unread: 0, newMail: [], changed: false } });
  });

  it("서버에 접속하지 못하면 실패로 알린다 (앱은 다음 시간에 다시 시도한다)", async () => {
    await setup();
    await imap.close();
    const r = await service.pollInbox();
    expect(r.ok).toBe(false);
    imap = await startFakeImap([]); // afterEach 용
  });
});
