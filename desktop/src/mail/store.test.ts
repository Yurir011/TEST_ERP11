import { beforeEach, describe, expect, it } from "vitest";

import { MailStore, type NewMessage } from "./store";
import { ALL_MAIL_FOLDER } from "./types";

let store: MailStore;

const msg = (over: Partial<NewMessage> & Pick<NewMessage, "folder" | "uid">): NewMessage => ({
  subject: "제목",
  fromName: "",
  fromAddr: "a@t.l",
  toText: "",
  date: 1_000 + over.uid,
  seen: false,
  flagged: false,
  hasAttachments: false,
  ...over,
});

beforeEach(() => {
  store = new MailStore(":memory:");
  store.replaceFolders([
    { path: "INBOX", name: "INBOX", specialUse: "\\Inbox", uidValidity: null },
    { path: "Sent", name: "Sent", specialUse: "\\Sent", uidValidity: null },
    { path: "Trash", name: "Trash", specialUse: "\\Trash", uidValidity: null },
    { path: "Spam", name: "Spam", specialUse: "\\Junk", uidValidity: null },
  ]);
  store.insertMessages([
    msg({ folder: "INBOX", uid: 1, subject: "견적서 송부", fromName: "김영업", seen: true }),
    msg({ folder: "INBOX", uid: 2, subject: "회의 안내", fromName: "박팀장", flagged: true }),
    msg({ folder: "INBOX", uid: 3, subject: "계약서 첨부", fromName: "이대리", hasAttachments: true }),
    msg({ folder: "Sent", uid: 1, subject: "보낸 견적서" }),
    msg({ folder: "Trash", uid: 1, subject: "지운 메일" }),
    msg({ folder: "Spam", uid: 1, subject: "광고 메일" }),
  ]);
});

const subjects = (folder: string, filter = {}) => store.list(folder, 50, 0, filter).map((m) => m.subject);

describe("목록 조건", () => {
  it("폴더만 지정하면 그 폴더의 메일을 최신순으로", () => {
    expect(subjects("INBOX")).toEqual(["계약서 첨부", "회의 안내", "견적서 송부"]);
    expect(store.count("INBOX")).toBe(3);
  });

  it("안 읽음·중요(별표)·첨부 조건", () => {
    expect(subjects("INBOX", { unread: true })).toEqual(["계약서 첨부", "회의 안내"]);
    expect(subjects("INBOX", { flagged: true })).toEqual(["회의 안내"]);
    expect(subjects("INBOX", { attachment: true })).toEqual(["계약서 첨부"]);
    expect(subjects("INBOX", { unread: true, attachment: true })).toEqual(["계약서 첨부"]);
    expect(store.count("INBOX", { unread: true })).toBe(2);
  });

  it("제목·보낸 사람 이름·주소로 검색한다", () => {
    expect(subjects("INBOX", { query: "견적" })).toEqual(["견적서 송부"]);
    expect(subjects("INBOX", { query: "박팀장" })).toEqual(["회의 안내"]);
    expect(subjects("INBOX", { query: "a@t.l" })).toHaveLength(3);
    expect(subjects("INBOX", { query: "없는말" })).toEqual([]);
  });

  it("검색어의 % _ ! 는 특수 문자가 아니라 글자 그대로 찾는다", () => {
    store.insertMessages([msg({ folder: "INBOX", uid: 9, subject: "100% 할인_행사!" })]);
    expect(subjects("INBOX", { query: "100%" })).toEqual(["100% 할인_행사!"]);
    expect(subjects("INBOX", { query: "%" })).toEqual(["100% 할인_행사!"]);
    expect(subjects("INBOX", { query: "_" })).toEqual(["100% 할인_행사!"]);
    expect(subjects("INBOX", { query: "!" })).toEqual(["100% 할인_행사!"]);
    expect(subjects("INBOX", { query: "10_%" })).toEqual([]); // 와일드카드로 해석되면 "100%" 가 걸렸을 것
  });

  it("검색어에 SQL 조각이 들어 있어도 그냥 글자로 취급한다", () => {
    expect(subjects("INBOX", { query: "' OR 1=1 --" })).toEqual([]);
    expect(store.count("INBOX")).toBe(3);
  });

  it("페이지 나누기", () => {
    expect(store.list("INBOX", 2, 0).map((m) => m.subject)).toEqual(["계약서 첨부", "회의 안내"]);
    expect(store.list("INBOX", 2, 2).map((m) => m.subject)).toEqual(["견적서 송부"]);
  });
});

describe("전체메일", () => {
  it("휴지통과 스팸을 뺀 모든 폴더의 메일을 모아 보여 준다", () => {
    const all = subjects(ALL_MAIL_FOLDER);
    expect(all).toContain("견적서 송부");
    expect(all).toContain("보낸 견적서");
    expect(all).not.toContain("지운 메일");
    expect(all).not.toContain("광고 메일");
    expect(store.count(ALL_MAIL_FOLDER)).toBe(4);
  });

  it("조건과 검색도 전체메일에서 같이 동작한다", () => {
    expect(subjects(ALL_MAIL_FOLDER, { query: "견적" }).sort()).toEqual(["견적서 송부", "보낸 견적서"]);
    expect(subjects(ALL_MAIL_FOLDER, { flagged: true })).toEqual(["회의 안내"]);
  });
});

describe("별표", () => {
  it("별표를 켜고 끌 수 있다", () => {
    const id = store.list("INBOX", 50, 0).find((m) => m.subject === "견적서 송부")!.id;
    store.setFlagged(id, true);
    expect(store.get(id)!.flagged).toBe(true);
    store.setFlagged(id, false);
    expect(store.get(id)!.flagged).toBe(false);
  });
});
