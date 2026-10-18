import { ImapFlow } from "imapflow";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MailCredentials } from "./account";
import { type FakeImap, buildRaw, startFakeImap } from "./fakeImap.testutil";
import { MailError, MailSync } from "./sync";
import { MailStore } from "./store";

const NOW = new Date("2026-10-17T12:00:00Z").getTime();
const recent = (n: number) => ({ raw: buildRaw({ subject: `메일 ${n}`, fromName: "홍길동", from: "hong@test.local" }), internaldate: new Date(NOW - n * 3_600_000) });
const old = { raw: buildRaw({ subject: "오래된 메일" }), internaldate: new Date("2026-01-01T00:00:00Z") };

let server: FakeImap;
let store: MailStore;

function creds(overrides: Partial<MailCredentials> = {}): MailCredentials {
  return { email: "me@test.local", username: server.user, password: server.pass, imapHost: "127.0.0.1", imapPort: server.port, smtpHost: "127.0.0.1", smtpPort: 1, ...overrides };
}

function makeSync(opts: { now?: number; windowDays?: number; credentials?: () => MailCredentials | null } = {}) {
  return new MailSync({
    store,
    credentials: opts.credentials ?? (() => creds()),
    now: () => opts.now ?? NOW,
    windowDays: opts.windowDays,
    connectOverrides: { secure: false, tls: { rejectUnauthorized: false } },
  });
}

/** 서버 쪽 상태를 바꾸는 별도 접속 (다른 프로그램이 같은 사서함을 쓰는 상황) */
async function asOtherClient<T>(job: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = new ImapFlow({ host: "127.0.0.1", port: server.port, secure: false, auth: { user: server.user, pass: server.pass }, logger: false });
  await c.connect();
  try {
    return await job(c);
  } finally {
    await c.logout();
  }
}

beforeEach(() => {
  store = new MailStore(":memory:");
});

afterEach(async () => {
  store.close();
  await server?.close();
});

describe("폴더 동기화", () => {
  it("폴더 목록과 용도(받은/보낸)를 저장한다", async () => {
    server = await startFakeImap([recent(1)]);
    await makeSync().syncFolders();
    const byPath = Object.fromEntries(store.folders().map((f) => [f.path, f]));
    expect(Object.keys(byPath).sort()).toEqual(["INBOX", "Sent"]);
    expect(byPath.INBOX.specialUse).toBe("\\Inbox");
    expect(byPath.Sent.specialUse).toBe("\\Sent");
  });
});

describe("메일 동기화", () => {
  it("기간(90일) 안의 메일만 받고, 한글 제목·보낸 사람·첨부 여부를 저장한다", async () => {
    const withAttachment = {
      raw: buildRaw({ subject: "견적서 송부", fromName: "김영업", from: "kim@test.local", attachments: [{ filename: "견적서.pdf", contentType: "application/pdf", content: Buffer.from("%PDF") }] }),
      internaldate: new Date(NOW - 1000),
    };
    server = await startFakeImap([old, recent(2), withAttachment]);
    const r = await makeSync().syncFolder("INBOX");
    expect(r).toEqual({ added: 2, removed: 0 });

    const items = store.list("INBOX", 50, 0);
    expect(items.map((m) => m.subject).sort()).toEqual(["견적서 송부", "메일 2"]);
    const att = items.find((m) => m.subject === "견적서 송부")!;
    expect(att.fromName).toBe("김영업");
    expect(att.fromAddr).toBe("kim@test.local");
    expect(att.hasAttachments).toBe(true);
    expect(items.find((m) => m.subject === "메일 2")!.hasAttachments).toBe(false);
  });

  it("다시 동기화해도 중복으로 쌓이지 않는다", async () => {
    server = await startFakeImap([recent(1), recent(2)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    const second = await sync.syncFolder("INBOX");
    expect(second).toEqual({ added: 0, removed: 0 });
    expect(store.count("INBOX")).toBe(2);
  });

  it("새로 도착한 메일만 추가로 받는다", async () => {
    server = await startFakeImap([recent(1)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    await asOtherClient((c) => c.append("INBOX", Buffer.from(buildRaw({ subject: "새 메일" })), [], new Date(NOW - 10)));
    const r = await sync.syncFolder("INBOX");
    expect(r.added).toBe(1);
    expect(store.list("INBOX", 10, 0).map((m) => m.subject)).toContain("새 메일");
  });

  it("서버에서 읽음/별표로 바뀐 표시를 반영한다", async () => {
    server = await startFakeImap([recent(1)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    expect(store.list("INBOX", 10, 0)[0]).toMatchObject({ seen: false, flagged: false });

    await asOtherClient(async (c) => {
      const lock = await c.getMailboxLock("INBOX");
      try {
        await c.messageFlagsAdd("1:*", ["\\Seen", "\\Flagged"], { uid: true });
      } finally {
        lock.release();
      }
    });
    await sync.syncFolder("INBOX");
    expect(store.list("INBOX", 10, 0)[0]).toMatchObject({ seen: true, flagged: true });
  });

  it("서버에서 지운 메일은 로컬에서도 지운다", async () => {
    server = await startFakeImap([recent(1), recent(2)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    await asOtherClient(async (c) => {
      const lock = await c.getMailboxLock("INBOX");
      try {
        await c.messageDelete("1", { uid: true });
      } finally {
        lock.release();
      }
    });
    const r = await sync.syncFolder("INBOX");
    expect(r.removed).toBe(1);
    expect(store.count("INBOX")).toBe(1);
  });

  it("기간 밖으로 밀려난 오래된 메일은 서버에 있는 한 로컬에서 지우지 않는다", async () => {
    server = await startFakeImap([recent(1), recent(2)]);
    await makeSync().syncFolder("INBOX");
    expect(store.count("INBOX")).toBe(2);
    // 석 달 넘게 지난 뒤: 두 메일 모두 90일 창 밖이지만 서버에는 그대로 있다
    const later = await makeSync({ now: NOW + 120 * 86_400_000 }).syncFolder("INBOX");
    expect(later).toEqual({ added: 0, removed: 0 });
    expect(store.count("INBOX")).toBe(2);
  });

  it("UIDVALIDITY 가 달라지면 로컬 사본을 버리고 서버 기준으로 다시 받는다", async () => {
    server = await startFakeImap([recent(1)]);
    const sync = makeSync();
    await sync.syncFolders();
    // 예전에 다른 UIDVALIDITY 로 받아 둔 사본이 있는 상태: UID 숫자는 같지만 지금 서버의 UID 1 번과는 다른 메일이다
    store.setUidValidity("INBOX", "999");
    store.insertMessages([{ folder: "INBOX", uid: 1, subject: "예전 사본", fromName: "", fromAddr: "", toText: "", date: NOW, seen: false, flagged: false, hasAttachments: false }]);
    const r = await sync.syncFolder("INBOX");
    expect(r.added).toBe(1);
    expect(store.list("INBOX", 10, 0).map((m) => m.subject)).toEqual(["메일 1"]);
    expect(store.uidValidity("INBOX")).toBe("1");
  });

  it("없는 폴더를 요청하면 설정 오류로 알린다", async () => {
    server = await startFakeImap([]);
    await expect(makeSync().syncFolder("없는폴더")).rejects.toMatchObject({ kind: "config" });
  });
});

describe("원문·읽음 표시", () => {
  it("메일 원문을 내려받는다", async () => {
    server = await startFakeImap([recent(1)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    const src = await sync.fetchSource("INBOX", store.list("INBOX", 1, 0)[0].uid);
    expect(src.toString("utf8")).toContain("Message-ID:");
  });

  it("서버의 읽음 표시를 바꾼다", async () => {
    server = await startFakeImap([recent(1)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    await sync.setSeenOnServer("INBOX", 1, true);
    const flags = await asOtherClient(async (c) => {
      const lock = await c.getMailboxLock("INBOX");
      try {
        const m = await c.fetchOne("1", { flags: true }, { uid: true });
        return m ? [...(m.flags ?? [])] : [];
      } finally {
        lock.release();
      }
    });
    expect(flags).toContain("\\Seen");
  });
});

describe("전체 폴더 동기화와 별표", () => {
  it("syncAll 은 휴지통·스팸을 뺀 모든 폴더를 받는다", async () => {
    server = await startFakeImap([recent(1)], { Sent: "\\Sent", Trash: "\\Trash", Spam: "\\Junk" });
    await asOtherClient(async (c) => {
      await c.append("Sent", Buffer.from(buildRaw({ subject: "보낸 메일" })), [], new Date(NOW - 5));
      await c.append("Trash", Buffer.from(buildRaw({ subject: "지운 메일" })), [], new Date(NOW - 5));
      await c.append("Spam", Buffer.from(buildRaw({ subject: "광고" })), [], new Date(NOW - 5));
    });
    const r = await makeSync().syncAll();
    expect(r.added).toBe(2); // INBOX 1 + Sent 1
    expect(store.count("INBOX")).toBe(1);
    expect(store.count("Sent")).toBe(1);
    expect(store.count("Trash")).toBe(0);
    expect(store.count("Spam")).toBe(0);
  });

  it("서버의 별표 표시를 바꾼다", async () => {
    server = await startFakeImap([recent(1)]);
    const sync = makeSync();
    await sync.syncFolder("INBOX");
    await sync.setFlaggedOnServer("INBOX", 1, true);
    await sync.syncFolder("INBOX");
    expect(store.list("INBOX", 5, 0)[0].flagged).toBe(true);
    await sync.setFlaggedOnServer("INBOX", 1, false);
    await sync.syncFolder("INBOX");
    expect(store.list("INBOX", 5, 0)[0].flagged).toBe(false);
  });
});

describe("접속 오류 안내", () => {
  it("비밀번호가 틀리면 로그인 실패로 안내하고 비밀번호를 문구에 싣지 않는다", async () => {
    server = await startFakeImap([]);
    const sync = makeSync({ credentials: () => creds({ password: "비밀-틀림-12345" }) });
    const err = await sync.syncFolders().catch((e) => e);
    expect(err).toBeInstanceOf(MailError);
    expect(err.kind).toBe("auth");
    expect(err.message).toContain("로그인에 실패");
    expect(err.message).not.toContain("비밀-틀림-12345");
  });

  it("서버가 없으면 연결 불가로 안내한다", async () => {
    server = await startFakeImap([]);
    const port = server.port;
    await server.close();
    const sync = makeSync({ credentials: () => creds({ imapPort: port }) });
    const err = await sync.syncFolders().catch((e) => e);
    expect(err.kind).toBe("network");
    server = await startFakeImap([]); // afterEach 가 닫을 수 있게
  });

  it("계정이 없으면 등록하라고 안내한다", async () => {
    server = await startFakeImap([]);
    const err = await makeSync({ credentials: () => null }).syncFolders().catch((e) => e);
    expect(err.kind).toBe("config");
  });

  it("접속 테스트는 로그인과 폴더 목록 읽기까지 확인한다", async () => {
    server = await startFakeImap([]);
    await expect(makeSync().testConnection(creds())).resolves.toEqual({ folders: 2 });
  });
});
