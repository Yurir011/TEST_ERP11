/**
 * 메일 계정 칸(slot) 관리. 계정마다 받은 메일 저장소·계정 설정·보내는 사람 목록 파일이 따로 있어서 메일함이 서로 섞이지 않는다.
 * 처음 쓰던 계정은 "main" 칸이고 예전 파일 이름(mail.db, account.json, identities.json)을 그대로 쓰므로, 업데이트해도 받아 둔 메일이 그대로 남는다.
 * 계정을 더 추가하면 새 칸(a1b2c3 같은 이름)이 생기고, 파일 이름에 그 이름이 붙는다.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MAIN_SLOT = "main";

export interface SlotPaths {
  db: string;
  account: string;
  identities: string;
}

const SLOT_RE = /^[a-z0-9]{1,16}$/;

/** 화면에서 온 값이 계정 칸 이름으로 쓸 수 있는 모양인가 (파일 이름에 쓰이므로 엄격하게 본다) */
export function isSlotId(value: unknown): value is string {
  return typeof value === "string" && SLOT_RE.test(value);
}

export function slotPaths(dir: string, id: string): SlotPaths {
  if (!isSlotId(id)) throw new Error(`계정 칸 이름이 올바르지 않습니다: ${String(id)}`);
  if (id === MAIN_SLOT) return { db: path.join(dir, "mail.db"), account: path.join(dir, "account.json"), identities: path.join(dir, "identities.json") };
  return { db: path.join(dir, `mail-${id}.db`), account: path.join(dir, `account-${id}.json`), identities: path.join(dir, `identities-${id}.json`) };
}

/** 칸 목록 파일(accounts.json). 파일이 없거나 손상되면 처음 쓰던 칸 하나만 있는 것으로 본다. */
export class SlotRegistry {
  private slots: string[];

  constructor(private readonly file: string) {
    this.slots = this.read();
  }

  ids(): string[] {
    return [...this.slots];
  }

  has(id: string): boolean {
    return this.slots.includes(id);
  }

  /** 새 칸을 만든다. 이미 있는 칸 중 비어 있는 칸이 있으면 그것을 쓰도록 호출한 쪽에서 먼저 확인한다. */
  add(): string {
    let id = "";
    do {
      id = `a${crypto.randomBytes(3).toString("hex")}`;
    } while (this.slots.includes(id));
    this.slots.push(id);
    this.write();
    return id;
  }

  /** 칸을 지운다. 처음 쓰던 칸(main)은 항상 남는다. */
  remove(id: string): boolean {
    if (id === MAIN_SLOT || !this.slots.includes(id)) return false;
    this.slots = this.slots.filter((s) => s !== id);
    this.write();
    return true;
  }

  private read(): string[] {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, "utf8")) as { slots?: unknown };
      const list = Array.isArray(j.slots) ? j.slots.filter(isSlotId) : [];
      const unique = Array.from(new Set(list));
      return unique.includes(MAIN_SLOT) ? unique : [MAIN_SLOT, ...unique];
    } catch {
      return [MAIN_SLOT];
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ slots: this.slots }, null, 2));
  }
}

/** 칸을 지울 때 그 칸의 파일(받아 둔 메일, 계정 설정, 보내는 사람)을 함께 지운다. 처음 쓰던 칸은 호출하지 않는다. */
export function deleteSlotFiles(dir: string, id: string): void {
  if (id === MAIN_SLOT) return;
  const p = slotPaths(dir, id);
  for (const f of [p.db, `${p.db}-wal`, `${p.db}-shm`, p.account, p.identities]) fs.rmSync(f, { force: true });
}
