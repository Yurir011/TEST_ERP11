import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HIDDEN_FLAG, badgeImageName, clampBadgeCount, loginItemSettings, parseConversationId, startsHidden } from "./startup";

describe("숨김 시작", () => {
  it("자동 실행으로 켜질 때만 창을 띄우지 않는다", () => {
    expect(startsHidden(["C:\\app\\BENCH ERP.exe", HIDDEN_FLAG])).toBe(true);
    expect(startsHidden(["C:\\app\\BENCH ERP.exe"])).toBe(false);
    expect(startsHidden([])).toBe(false);
  });
});

describe("윈도우 시작 시 자동 실행 설정", () => {
  it("켜면 숨김 옵션과 함께 등록하고, 끄면 옵션도 비운다", () => {
    expect(loginItemSettings(true)).toEqual({ openAtLogin: true, args: ["--hidden"] });
    expect(loginItemSettings(false)).toEqual({ openAtLogin: false, args: [] });
  });
});

describe("작업 표시줄 배지", () => {
  it.each([
    [0, null], [-3, null], [Number.NaN, null], [Number.POSITIVE_INFINITY, null], ["5", null], [null, null], [undefined, null],
    [1, "1.png"], [9, "9.png"], [9.9, "9.png"], [10, "9plus.png"], [250, "9plus.png"],
  ])("%j → %j", (count, expected) => {
    expect(badgeImageName(count)).toBe(expected);
  });

  it("배지로 쓸 그림 파일이 실제로 모두 있다 (1~9 와 9+)", () => {
    const dir = path.join(__dirname, "..", "assets", "badges");
    for (const name of [...Array.from({ length: 9 }, (_v, i) => `${i + 1}.png`), "9plus.png"]) {
      expect(fs.existsSync(path.join(dir, name)), name).toBe(true);
      expect(fs.statSync(path.join(dir, name)).size).toBeGreaterThan(100);
    }
  });

  it("툴팁용 개수는 0~999 로 정리하고 이상한 값은 0", () => {
    expect(clampBadgeCount(5)).toBe(5);
    expect(clampBadgeCount(5000)).toBe(999);
    expect(clampBadgeCount(-1)).toBe(0);
    expect(clampBadgeCount(3.7)).toBe(3);
    expect(clampBadgeCount("7")).toBe(0);
    expect(clampBadgeCount(Number.NaN)).toBe(0);
  });
});

describe("알림의 대화방 번호", () => {
  it("1 이상의 정수만 인정한다", () => {
    expect(parseConversationId(7)).toBe(7);
    for (const bad of [0, -1, 1.5, "7", null, undefined, Number.NaN, Number.MAX_VALUE, {}, [7]]) expect(parseConversationId(bad)).toBeNull();
  });
});
