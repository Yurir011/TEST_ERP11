import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { IdentityStore, MAX_IDENTITIES, parseIdentitySettings } from "./identities";

const ok = (v: unknown) => {
  const r = parseIdentitySettings(v);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("보내는 사람 설정 검사", () => {
  it("이름·주소를 정리하고(앞뒤 공백 제거) 기본 주소를 고른다", () => {
    const v = ok({ items: [{ name: " 정혜란 ", address: " yurir@epik-bio.com " }, { name: "유리알", address: "epik.yurir@daum.net" }], defaultAddress: "YURIR@epik-bio.com" });
    expect(v.items).toEqual([
      { name: "정혜란", address: "yurir@epik-bio.com" },
      { name: "유리알", address: "epik.yurir@daum.net" },
    ]);
    expect(v.defaultAddress).toBe("YURIR@epik-bio.com");
  });

  it("등록되지 않은 주소를 기본으로 하면 기본은 비운다(계정 주소 사용)", () => {
    expect(ok({ items: [{ name: "a", address: "a@x.com" }], defaultAddress: "other@x.com" }).defaultAddress).toBe("");
    expect(ok({ items: [] }).defaultAddress).toBe("");
  });

  it("틀린 값은 거절한다", () => {
    const bad: unknown[] = [
      null,
      "x",
      { items: "x" },
      { items: [null] },
      { items: [{ name: "a" }] },
      { items: [{ name: "a", address: "no-at" }] },
      { items: [{ name: "a", address: "a@x.com" + String.fromCharCode(13, 10) + "Bcc: z@z.com" }] },
      { items: [{ name: "a<b>", address: "a@x.com" }] },
      { items: [{ name: 'a"b', address: "a@x.com" }] },
      { items: [{ name: "a" + String.fromCharCode(10) + "b", address: "a@x.com" }] },
      { items: [{ name: "가".repeat(101), address: "a@x.com" }] },
      {
        items: [
          { name: "a", address: "a@x.com" },
          { name: "b", address: "A@X.com" },
        ],
      },
      { items: Array.from({ length: MAX_IDENTITIES + 1 }, (_, i) => ({ name: "n", address: `a${i}@x.com` })) },
    ];
    for (const v of bad) expect(parseIdentitySettings(v).ok, JSON.stringify(v)?.slice(0, 70)).toBe(false);
  });

  it("이름이 비어 있어도 주소만 있으면 받는다 (이름은 ERP 사용자 이름을 쓴다)", () => {
    expect(ok({ items: [{ name: "", address: "a@x.com" }] }).items[0].name).toBe("");
  });
});

describe("보내는 사람 저장소", () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bench-ident-")), "sub", "identities.json");

  it("저장했다 읽는다", () => {
    const file = tmp();
    const value = { items: [{ name: "정혜란", address: "yurir@epik-bio.com" }], defaultAddress: "yurir@epik-bio.com" };
    new IdentityStore(file).save(value);
    expect(new IdentityStore(file).load()).toEqual(value);
  });

  it("파일이 없거나 깨졌거나 이상한 값이면 빈 설정", () => {
    const file = tmp();
    expect(new IdentityStore(file).load()).toEqual({ items: [], defaultAddress: "" });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not json");
    expect(new IdentityStore(file).load().items).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ items: [{ name: "a", address: "bad" }] }));
    expect(new IdentityStore(file).load().items).toEqual([]);
  });
});
