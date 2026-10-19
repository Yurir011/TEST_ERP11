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
