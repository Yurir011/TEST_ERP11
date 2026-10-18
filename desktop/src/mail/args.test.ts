import { describe, expect, it } from "vitest";

import { parseAttachmentIndex, parseFilter, parseFolderPath, parseMailId, parsePaging } from "./args";

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

  it("페이지 값은 보정된다", () => {
    expect(parsePaging(10, 20)).toEqual({ offset: 10, limit: 20 });
    expect(parsePaging(-3, 99999)).toEqual({ offset: 0, limit: 200 });
    expect(parsePaging("x", 0)).toEqual({ offset: 0, limit: 1 });
    expect(parsePaging(undefined, undefined)).toEqual({ offset: 0, limit: 50 });
  });
});
