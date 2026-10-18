import { describe, expect, it } from "vitest";

import { dedupeAddresses, isValidEmail, parseAddressList } from "./address";

describe("isValidEmail", () => {
  it.each(["a@b.co", "hong.gildong+test@company.co.kr", "x_y-z@sub.domain.com", "a@한글도메인.kr"])("올바른 주소: %s", (a) => expect(isValidEmail(a)).toBe(true));
  it.each(["", "a", "a@b", "@b.co", "a@.co", "a@b..co", ".a@b.co", "a.@b.co", "a..b@c.co", "a b@c.co", "a@b c.co", "a@b.co\n", "a<b>@c.co", "a@-b.co", `${"x".repeat(65)}@b.co`])("잘못된 주소: %j", (a) => expect(isValidEmail(a)).toBe(false));
});

describe("parseAddressList", () => {
  it("한 명, 이름이 있는 주소, 여러 명(쉼표·세미콜론·줄바꿈)", () => {
    expect(parseAddressList("a@b.co")).toEqual({ ok: true, value: [{ name: "", address: "a@b.co" }] });
    expect(parseAddressList("홍길동 <hong@b.co>")).toEqual({ ok: true, value: [{ name: "홍길동", address: "hong@b.co" }] });
    expect(parseAddressList('"김, 영업" <kim@b.co>; c@d.co\ne@f.co')).toEqual({
      ok: true,
      value: [
        { name: "김, 영업", address: "kim@b.co" },
        { name: "", address: "c@d.co" },
        { name: "", address: "e@f.co" },
      ],
    });
  });

  it("빈 입력은 빈 목록", () => {
    expect(parseAddressList("")).toEqual({ ok: true, value: [] });
    expect(parseAddressList("  ,  ; ")).toEqual({ ok: true, value: [] });
  });

  it("잘못된 주소가 하나라도 있으면 어느 것인지 알려 주며 거절한다", () => {
    const r = parseAddressList("a@b.co, 잘못된주소, c@d.co");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("잘못된주소");
  });

  it("헤더 끼워 넣기 시도(줄바꿈 뒤 Bcc: 등)를 거절한다", () => {
    for (const attack of ["a@b.co\r\nBcc: evil@x.co", "a@b.co%0d%0aBcc: evil@x.co", "a@b.co\nBcc: evil@x.co", "a@b.co\r\n\r\n본문"]) {
      const r = parseAddressList(attack);
      expect(r.ok, attack).toBe(false);
    }
  });

  it("탭·널 같은 제어 문자를 거절한다", () => {
    expect(parseAddressList("  a@b.co  ").ok).toBe(true); // 앞뒤 공백은 정리된다
    expect(parseAddressList("a@b.co\t").ok).toBe(false); // 탭은 위치와 상관없이 거절한다
    expect(parseAddressList("a\t@b.co").ok).toBe(false);
    expect(parseAddressList("a@b.co\u0000").ok).toBe(false);
  });

  it("사람 수 한도를 넘으면 거절한다", () => {
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@b.co`).join(",");
    expect(parseAddressList(many).ok).toBe(false);
    expect(parseAddressList(many, 100).ok).toBe(true);
  });

  it("문자열이 아니면 거절한다", () => {
    for (const v of [null, undefined, 5, {}, ["a@b.co"]]) expect(parseAddressList(v).ok).toBe(false);
  });
});

describe("dedupeAddresses", () => {
  it("대소문자만 다른 같은 주소는 한 번만", () => {
    expect(dedupeAddresses([{ name: "", address: "A@b.co" }, { name: "x", address: "a@B.co" }, { name: "", address: "c@d.co" }])).toHaveLength(2);
  });
});
