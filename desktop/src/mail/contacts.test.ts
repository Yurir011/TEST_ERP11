import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SecretStore } from "../device";
import { MailAccountStore } from "./account";
import { extractAddresses } from "./address";
import { MailService } from "./service";
import { MailStore, type NewMessage } from "./store";
import { MailSync } from "./sync";

const secrets: SecretStore = {
  available: () => true,
  encrypt: (p) => Buffer.from(p),
  decrypt: (c) => c,
};

let dir: string;
let store: MailStore;
let service: MailService;

const sentMsg = (uid: number, toText: string, date: number): NewMessage => ({
  folder: "Sent",
  uid,
  subject: "s",
  fromName: "",
  fromAddr: "me@bench.co.kr",
  toText,
  date,
  seen: true,
  flagged: false,
  hasAttachments: false,
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-contacts-"));
  store = new MailStore(":memory:");
  const accounts = new MailAccountStore(path.join(dir, "acc.json"), secrets);
  accounts.save({ email: "me@bench.co.kr", username: "me", password: "pw", imapHost: "127.0.0.1", imapPort: 993, smtpHost: "127.0.0.1", smtpPort: 465 });
  service = new MailService({ accounts, store, sync: new MailSync({ store, credentials: () => accounts.credentials() }) });
  store.replaceFolders([
    { path: "INBOX", name: "INBOX", specialUse: "\\Inbox", uidValidity: null },
    { path: "Sent", name: "Sent", specialUse: "\\Sent", uidValidity: null },
  ]);
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("저장된 받는 사람 글에서 주소 뽑기", () => {
  it("이름 붙은 주소·맨 주소·따옴표 이름을 뽑고 올바르지 않은 주소는 버린다", () => {
    expect(extractAddresses('홍길동 <hong@a.co>, b@y.com, "김, 철수" <kim@z.kr>, 잘못된, <x@@y>')).toEqual([
      { name: "홍길동", address: "hong@a.co" },
      { name: "", address: "b@y.com" },
      { name: "김, 철수", address: "kim@z.kr" },
    ]);
    expect(extractAddresses("")).toEqual([]);
  });
});

describe("주소록 (받는 사람 자동완성)", () => {
  it("앱에서 보낸 받는 사람이 들어가고, 다시 보내면 이름·횟수를 갱신한다", () => {
    store.recordContacts([{ name: "", address: "a@x.com" }], 1000);
    store.recordContacts([{ name: "에이", address: "A@x.com" }], 2000); // 대소문자만 다른 같은 주소
    const rows = store.contactRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ address: "A@x.com", name: "에이", lastUsed: 2000, useCount: 2 }); // 대소문자는 가장 최근에 쓴 것
    store.recordContacts([{ name: "", address: "a@x.com" }], 3000); // 이름 없이 다시 보내도 이름은 남는다
    expect(store.contactRows()[0].name).toBe("에이");
  });

  it("보낸메일함에 있던 받는 사람도 후보가 되고, 최근에 쓴 순서로 나온다", () => {
    store.insertMessages([sentMsg(1, "오래전 <old@x.com>", 1_000), sentMsg(2, "최근 <new@x.com>, mid@x.com", 5_000)]);
    store.recordContacts([{ name: "방금", address: "just@x.com" }], 9_000);
    expect(service.contacts("", 10).map((c) => c.address)).toEqual(["just@x.com", "new@x.com", "mid@x.com", "old@x.com"]);
  });

  it("같은 주소는 한 번만, 가장 최근 이름으로 나온다", () => {
    store.insertMessages([sentMsg(1, "옛이름 <a@x.com>", 1_000)]);
    store.recordContacts([{ name: "새이름", address: "a@x.com" }], 2_000);
    expect(service.contacts("", 10)).toEqual([{ name: "새이름", address: "a@x.com" }]);
  });

  it("내 계정 주소는 후보에서 뺀다 (내게쓰기를 해도 주소록에 내가 나오지 않는다)", () => {
    store.recordContacts([{ name: "", address: "ME@bench.co.kr" }, { name: "", address: "a@x.com" }], 1000);
    expect(service.contacts("", 10).map((c) => c.address)).toEqual(["a@x.com"]);
  });

  it("입력한 글로 이름·주소를 걸러 내고, 앞부분이 맞는 것을 먼저 보여 준다", () => {
    store.recordContacts(
      [
        { name: "박영업", address: "park@a.com" },
        { name: "김박사", address: "kim@b.com" },
        { name: "이대리", address: "lee@park-co.kr" },
        { name: "최팀장", address: "choi@c.com" },
      ],
      1000,
    );
    // "박" → 이름이 박으로 시작하는 박영업이 먼저, 이름 중간에 박이 있는 김박사가 그다음, 관련 없는 것은 빠진다
    expect(service.contacts("박", 10).map((c) => c.name)).toEqual(["박영업", "김박사"]);
    expect(service.contacts("PARK", 10).map((c) => c.address)).toEqual(["park@a.com", "lee@park-co.kr"]);
    expect(service.contacts("없는사람", 10)).toEqual([]);
  });

  it("개수 제한을 지킨다", () => {
    store.recordContacts(Array.from({ length: 30 }, (_, i) => ({ name: "", address: `u${i}@x.com` })), 1000);
    expect(service.contacts("", 5)).toHaveLength(5);
    expect(service.contacts("", 9999).length).toBeLessThanOrEqual(50);
    expect(service.contacts("", 0)).toHaveLength(1);
  });

  it("목록에서 지우면 보낸메일함에 있던 주소도 나타나지 않고, 다시 보내면 돌아온다", () => {
    store.insertMessages([sentMsg(1, "a@x.com, b@x.com", 1_000)]);
    store.recordContacts([{ name: "", address: "c@x.com" }], 2_000);
    expect(service.removeContact("A@x.com")).toBe(true);
    expect(service.removeContact("c@x.com")).toBe(true);
    expect(service.contacts("", 10).map((c) => c.address)).toEqual(["b@x.com"]);
    store.recordContacts([{ name: "", address: "a@x.com" }], 9_000);
    expect(service.contacts("", 10).map((c) => c.address)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("올바르지 않은 주소는 지울 수 없다", () => {
    expect(service.removeContact("not-an-email")).toBe(false);
    expect(service.removeContact("a@x.com\r\nBcc: z@z.com")).toBe(false);
  });
});

describe("저장소 버전 올림", () => {
  it("예전(주소록이 없던) 저장소 파일도 열면 주소록 표가 생기고 기존 메일은 그대로다", () => {
    const file = path.join(dir, "old.db");
    // 버전 1 의 저장소를 흉내 낸다: 같은 파일을 새 코드로 다시 연다
    const first = new MailStore(file);
    first.replaceFolders([{ path: "INBOX", name: "INBOX", specialUse: "\\Inbox", uidValidity: null }]);
    first.insertMessages([{ ...sentMsg(1, "a@x.com", 1000), folder: "INBOX" }]);
    first.close();
    const again = new MailStore(file);
    expect(again.contactRows()).toEqual([]);
    expect(again.localUids("INBOX")).toEqual([1]);
    again.close();
  });
});

describe("주소록 화면 (전체 목록·추가·수정·삭제)", () => {
  it("직접 추가한 연락처와 자동으로 올라온 주소를 이름순으로 합쳐 보여 준다", () => {
    store.insertMessages([sentMsg(1, "다람쥐 <dd@x.com>", 1_000)]);
    store.recordContacts([{ name: "나비", address: "nabi@x.com" }], 2_000);
    expect(service.saveContact({ name: "가나다", address: "ga@x.com", memo: "거래처 대표" }).ok).toBe(true);
    const book = service.addressBook("");
    expect(book.map((e) => e.name)).toEqual(["가나다", "나비", "다람쥐"]);
    expect(book.find((e) => e.address === "ga@x.com")).toMatchObject({ manual: true, memo: "거래처 대표" });
    expect(book.find((e) => e.address === "nabi@x.com")).toMatchObject({ manual: false, memo: "" });
  });

  it("검색은 이름·주소·메모에 맞는 것을 찾는다", () => {
    service.saveContact({ name: "박영업", address: "park@a.com", memo: "한빛통신 담당" });
    service.saveContact({ name: "이대리", address: "lee@b.com", memo: "" });
    expect(service.addressBook("한빛").map((e) => e.address)).toEqual(["park@a.com"]);
    expect(service.addressBook("LEE@").map((e) => e.address)).toEqual(["lee@b.com"]);
    expect(service.addressBook("영업").map((e) => e.address)).toEqual(["park@a.com"]);
    expect(service.addressBook("없는말")).toEqual([]);
  });

  it("보낸 메일로 이름이 자동으로 바뀌어도 직접 입력한 이름·메모는 그대로다", () => {
    service.saveContact({ name: "내가 정한 이름", address: "a@x.com", memo: "메모" });
    store.recordContacts([{ name: "서버가 준 이름", address: "a@x.com" }], 9_000);
    store.insertMessages([sentMsg(1, "또 다른 이름 <a@x.com>", 5_000)]);
    expect(service.addressBook("")).toEqual([expect.objectContaining({ name: "내가 정한 이름", memo: "메모", manual: true })]);
  });

  it("수정하면 이름·메모가 바뀌고, 주소를 바꾸면 예전 주소는 목록에서 빠진다", () => {
    service.saveContact({ name: "에이", address: "old@x.com", memo: "" });
    const r = service.saveContact({ name: "에이(수정)", address: "new@x.com", memo: "새 메모", oldAddress: "old@x.com" });
    expect(r).toMatchObject({ ok: true, value: { address: "new@x.com", manual: true } });
    expect(service.addressBook("")).toEqual([expect.objectContaining({ name: "에이(수정)", address: "new@x.com", memo: "새 메모" })]);
    // 주소는 그대로 이름만 고치면 같은 한 건
    service.saveContact({ name: "에이2", address: "NEW@x.com", memo: "새 메모", oldAddress: "new@x.com" });
    expect(service.addressBook("").map((e) => e.name)).toEqual(["에이2"]);
  });

  it("보낸메일함에서 뽑힌 주소도 고치면 직접 입력한 연락처가 된다", () => {
    store.insertMessages([sentMsg(1, "자동 <auto@x.com>", 1_000)]);
    service.saveContact({ name: "자동(정리됨)", address: "auto@x.com", memo: "중요 거래처" });
    expect(service.addressBook("")).toEqual([expect.objectContaining({ name: "자동(정리됨)", memo: "중요 거래처", manual: true })]);
  });

  it("지운 연락처는 사라지고, 같은 주소를 다시 추가하면 돌아온다", () => {
    service.saveContact({ name: "에이", address: "a@x.com", memo: "" });
    expect(service.removeContact("a@x.com")).toBe(true);
    expect(service.addressBook("")).toEqual([]);
    service.saveContact({ name: "에이", address: "a@x.com", memo: "" });
    expect(service.addressBook("")).toHaveLength(1);
  });

  it("내 계정 주소는 주소록에 나오지 않는다", () => {
    service.saveContact({ name: "나", address: "ME@bench.co.kr", memo: "" });
    expect(service.addressBook("")).toEqual([]);
  });

  it("잘못된 입력은 이유와 함께 거절하고 아무것도 저장하지 않는다", () => {
    const bad = [
      { name: "a", address: "", memo: "" },
      { name: "a", address: "not-an-email", memo: "" },
      { name: "a", address: "a@x.com" + String.fromCharCode(13, 10) + "Bcc: z@z.com", memo: "" },
      { name: "a<b>", address: "a@x.com", memo: "" },
      { name: 'a"b', address: "a@x.com", memo: "" },
      { name: "가".repeat(101), address: "a@x.com", memo: "" },
      { name: "a", address: "a@x.com", memo: "가".repeat(201) },
      { name: "a", address: "a@x.com", memo: "줄" + String.fromCharCode(10) + "바꿈" },
      { name: "a", address: "a@x.com", memo: "", oldAddress: "bad-old" },
    ];
    for (const input of bad) {
      const r = service.saveContact(input);
      expect(r.ok, JSON.stringify(input).slice(0, 60)).toBe(false);
    }
    expect(service.addressBook("")).toEqual([]);
  });

  it("앞뒤 공백은 정리해서 저장한다", () => {
    expect(service.saveContact({ name: "  에이 ", address: " a@x.com ", memo: " 메모 " })).toMatchObject({ ok: true, value: { name: "에이", address: "a@x.com", memo: "메모" } });
  });
});

describe("저장소 버전 올림 (주소록 메모 추가)", () => {
  it("메모·직접 추가 열이 없던 예전 주소록 표도 그대로 열린다", async () => {
    const file = path.join(dir, "v2.db");
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(file);
    db.exec(`
      CREATE TABLE folders (path TEXT PRIMARY KEY, name TEXT NOT NULL, special_use TEXT, uid_validity TEXT);
      CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, folder TEXT NOT NULL REFERENCES folders(path) ON DELETE CASCADE, uid INTEGER NOT NULL, subject TEXT NOT NULL DEFAULT '', from_name TEXT NOT NULL DEFAULT '', from_addr TEXT NOT NULL DEFAULT '', to_text TEXT NOT NULL DEFAULT '', date INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0, flagged INTEGER NOT NULL DEFAULT 0, has_attachments INTEGER NOT NULL DEFAULT 0, body_text TEXT, body_html TEXT, cc_text TEXT, attachments_json TEXT, UNIQUE (folder, uid));
      CREATE TABLE contacts (address TEXT PRIMARY KEY COLLATE NOCASE, name TEXT NOT NULL DEFAULT '', last_used INTEGER NOT NULL, use_count INTEGER NOT NULL DEFAULT 1, hidden INTEGER NOT NULL DEFAULT 0);
      INSERT INTO contacts (address, name, last_used) VALUES ('old@x.com', '예전', 1000);
      PRAGMA user_version = 2;
    `);
    db.close();
    const upgraded = new MailStore(file);
    expect(upgraded.contactRows()).toEqual([expect.objectContaining({ address: "old@x.com", name: "예전", memo: "", manual: false })]);
    upgraded.saveContact({ address: "new@x.com", name: "새", memo: "m" }, 2000);
    expect(upgraded.contactRows()).toHaveLength(2);
    upgraded.close();
  });
});
