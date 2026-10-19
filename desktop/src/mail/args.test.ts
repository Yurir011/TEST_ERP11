import { describe, expect, it } from "vitest";

import { parseAttachmentIndex, parseDocumentCompose, parseDraftKind, parseFilter, parseFolderPath, parseMailId, parseMailIds, parsePaging, parseSendPayload } from "./args";

describe("IPC 인자 검사", () => {
  it("메일 번호는 양의 정수만", () => {
    expect(parseMailId(5)).toBe(5);
    for (const v of [0, -1, 1.5, "5", null, undefined, NaN, Infinity, {}, [5]]) expect(parseMailId(v), String(v)).toBeNull();
  });

  it("폴더 경로는 1~255자 문자열이고 제어 문자가 없어야 한다", () => {
    expect(parseFolderPath("INBOX")).toBe("INBOX");
    expect(parseFolderPath("받은 편지함/하위")).toBe("받은 편지함/하위");
    for (const v of ["", "a\nb", "a\u0000b", "x".repeat(256), 3, null]) expect(parseFolderPath(v)).toBeNull();
  });

  it("첨부 번호는 0 이상 정수", () => {
    expect(parseAttachmentIndex(0)).toBe(0);
    for (const v of [-1, 1.2, "0", 1000, null]) expect(parseAttachmentIndex(v)).toBeNull();
  });

  it("목록 조건은 알려진 키와 올바른 값만 받는다", () => {
    expect(parseFilter({ unread: true, flagged: true, attachment: true, query: "  견적  " })).toEqual({ unread: true, flagged: true, attachment: true, query: "견적" });
    expect(parseFilter({ unread: "true", flagged: 1, evil: true, query: "   " })).toEqual({});
    expect(parseFilter({ query: "x".repeat(300) }).query).toHaveLength(100);
    for (const v of [null, undefined, "x", 5]) expect(parseFilter(v)).toEqual({});
  });

  it("메일 번호 목록은 1~500개의 양의 정수만", () => {
    expect(parseMailIds([1, 2, 3])).toEqual([1, 2, 3]);
    expect(parseMailIds(Array.from({ length: 500 }, (_, i) => i + 1))).toHaveLength(500);
    for (const v of [[], Array.from({ length: 501 }, (_, i) => i + 1), [0], [-1], [1.5], ["1"], [1, null], "1", null, undefined, {}]) {
      expect(parseMailIds(v), JSON.stringify(v)?.slice(0, 30)).toBeNull();
    }
  });

  it("목록 조건의 번호(ids)는 양의 정수 배열만 받는다", () => {
    expect(parseFilter({ ids: [3, 4] }).ids).toEqual([3, 4]);
    expect(parseFilter({ ids: [] }).ids).toEqual([]); // 빈 목록은 "결과 없음"이라는 뜻이라 그대로 둔다
    for (const bad of [["a"], [0], [1.2], "1", 5, Array.from({ length: 5001 }, (_, i) => i + 1)]) expect(parseFilter({ ids: bad }).ids).toBeUndefined();
  });

  it("초안 종류는 정해진 네 가지만", () => {
    for (const k of ["reply", "replyAll", "forward", "self"]) expect(parseDraftKind(k)).toBe(k);
    for (const k of ["", "REPLY", "new", null, 1, undefined]) expect(parseDraftKind(k)).toBeNull();
  });

  it("보내기 요청의 형식을 검사한다", () => {
    const ok = { fromName: "박소장", to: "a@b.co", cc: "", bcc: "", subject: "제목", body: "본문", attachmentIds: ["id-1"] };
    expect(parseSendPayload(ok)).toEqual({ ...ok, threading: undefined });
    expect(parseSendPayload({ ...ok, threading: { inReplyTo: "<a@b>", references: ["<a@b>"] } })?.threading).toEqual({ inReplyTo: "<a@b>", references: ["<a@b>"] });
    expect(parseSendPayload({ ...ok, fromAddress: "yurir@pik-bio.com" })?.fromAddress).toBe("yurir@pik-bio.com");
    expect(parseSendPayload({ ...ok, fromAddress: null })?.fromAddress).toBeUndefined();
    for (const bad of [null, "x", { ...ok, fromAddress: 5 }, { ...ok, fromAddress: "a".repeat(321) }, { ...ok, to: 5 }, { ...ok, body: undefined }, { ...ok, attachmentIds: "id" }, { ...ok, attachmentIds: [1] }, { ...ok, attachmentIds: Array(51).fill("x") }, { ...ok, to: "a".repeat(20_001) }, { ...ok, threading: "x" }, { ...ok, threading: { references: "x" } }, { ...ok, threading: { inReplyTo: 3 } }]) {
      expect(parseSendPayload(bad), JSON.stringify(bad).slice(0, 60)).toBeNull();
    }
  });

  it("페이지 값은 보정된다", () => {
    expect(parsePaging(10, 20)).toEqual({ offset: 10, limit: 20 });
    expect(parsePaging(-3, 99999)).toEqual({ offset: 0, limit: 200 });
    expect(parsePaging("x", 0)).toEqual({ offset: 0, limit: 1 });
    expect(parsePaging(undefined, undefined)).toEqual({ offset: 0, limit: 50 });
  });
});

describe("문서 메일 보내기 인자 검사", () => {
  const ok = () => ({ to: "a@x.com", subject: "견적서", body: "안녕하세요", doc: { type: "project_document", id: 3 }, filename: "견적서.pdf", data: new Uint8Array([37, 80, 68, 70]).buffer });

  it("올바른 값은 받고 PDF 바이트를 Buffer 로 바꾼다", () => {
    const r = parseDocumentCompose(ok());
    expect(r?.doc).toEqual({ type: "project_document", id: 3 });
    expect(r?.data.toString()).toBe("%PDF");
    expect(parseDocumentCompose({ ...ok(), data: new Uint8Array([1, 2]) })?.data.length).toBe(2);
  });

  it("틀린 값은 모두 거절한다", () => {
    const bad: Record<string, unknown>[] = [
      { doc: { type: "payment", id: 3 } },
      { doc: { type: "project_document", id: 0 } },
      { doc: null },
      { to: 5 },
      { subject: "x".repeat(256) },
      { body: "x".repeat(20_001) },
      { filename: "" },
      { filename: "x".repeat(201) },
      { data: "문자열" },
      { data: undefined },
    ];
    for (const patch of bad) expect(parseDocumentCompose({ ...ok(), ...patch }), JSON.stringify(Object.keys(patch))).toBeNull();
    expect(parseDocumentCompose(null)).toBeNull();
  });
});
