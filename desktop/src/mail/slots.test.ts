import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAIN_SLOT, SlotRegistry, deleteSlotFiles, isSlotId, slotPaths } from "./slots";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-mail-slots-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("메일 계정 칸", () => {
  it("처음 쓰던 칸은 예전 파일 이름을 그대로 써서 받아 둔 메일이 남는다", () => {
    const p = slotPaths(dir, MAIN_SLOT);
    expect(path.basename(p.db)).toBe("mail.db");
    expect(path.basename(p.account)).toBe("account.json");
    expect(path.basename(p.identities)).toBe("identities.json");
  });

  it("다른 칸은 칸 이름이 붙은 따로따로의 파일을 쓴다", () => {
    const a = slotPaths(dir, "a1b2c3");
    const b = slotPaths(dir, "d4e5f6");
    expect(path.basename(a.db)).toBe("mail-a1b2c3.db");
    expect(new Set([a.db, a.account, a.identities, b.db, b.account, b.identities]).size).toBe(6);
  });

  it("칸 이름은 파일 이름으로 안전한 모양만 쓴다 (경로 조작을 막는다)", () => {
    expect(isSlotId("main")).toBe(true);
    expect(isSlotId("a1b2c3")).toBe(true);
    for (const bad of ["", "../x", "a/b", "A1", "a b", 5, null, "x".repeat(17)]) expect(isSlotId(bad)).toBe(false);
    expect(() => slotPaths(dir, "../evil")).toThrow();
  });

  it("목록 파일이 없으면 처음 칸 하나만 있고, 새 칸을 더하면 저장되어 다시 열어도 남는다", () => {
    const file = path.join(dir, "accounts.json");
    const reg = new SlotRegistry(file);
    expect(reg.ids()).toEqual([MAIN_SLOT]);
    const added = reg.add();
    expect(isSlotId(added) && added !== MAIN_SLOT).toBe(true);
    expect(new SlotRegistry(file).ids()).toEqual([MAIN_SLOT, added]);
  });

  it("칸을 지워도 처음 칸은 남고, 손상된 목록 파일은 처음 칸 하나로 시작한다", () => {
    const file = path.join(dir, "accounts.json");
    const reg = new SlotRegistry(file);
    const added = reg.add();
    expect(reg.remove(MAIN_SLOT)).toBe(false);
    expect(reg.remove(added)).toBe(true);
    expect(reg.remove(added)).toBe(false);
    expect(reg.ids()).toEqual([MAIN_SLOT]);
    fs.writeFileSync(file, "{깨진 파일");
    expect(new SlotRegistry(file).ids()).toEqual([MAIN_SLOT]);
    fs.writeFileSync(file, JSON.stringify({ slots: ["a1b2c3", "../x", "a1b2c3"] }));
    expect(new SlotRegistry(file).ids()).toEqual([MAIN_SLOT, "a1b2c3"]); // 이상한 이름·중복은 버리고 처음 칸을 앞에 둔다
  });

  it("칸을 지울 때 그 칸의 파일만 지우고 처음 칸의 파일은 건드리지 않는다", () => {
    const mine = slotPaths(dir, "a1b2c3");
    const main = slotPaths(dir, MAIN_SLOT);
    for (const f of [mine.db, `${mine.db}-wal`, mine.account, mine.identities, main.db, main.account]) fs.writeFileSync(f, "x");
    deleteSlotFiles(dir, "a1b2c3");
    expect([mine.db, `${mine.db}-wal`, mine.account, mine.identities].some((f) => fs.existsSync(f))).toBe(false);
    deleteSlotFiles(dir, MAIN_SLOT);
    expect(fs.existsSync(main.db) && fs.existsSync(main.account)).toBe(true);
  });
});
