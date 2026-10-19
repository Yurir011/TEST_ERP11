/**
 * 보내는 사람 목록 (다음 메일의 "보내는 사람 선택"처럼 쓰기 화면에서 고르는 이름·주소들).
 * 비밀이 아닌 설정이라 평문 JSON 으로 이 PC 에 저장한다. 서버로 보내지 않는다.
 * 여기 있는 주소가 실제로 나가려면 메일 서버가 그 주소를 허용해야 한다(내 계정·서버에 등록된 별칭).
 */
import fs from "node:fs";
import path from "node:path";

import { type Logger, silentLogger } from "../log";
import { isValidEmail } from "./address";

export interface SenderIdentity {
  name: string;
  address: string;
}

export interface IdentitySettings {
  items: SenderIdentity[];
  /** 기본으로 고를 주소 (없으면 로그인한 계정 주소) */
  defaultAddress: string;
}

export const MAX_IDENTITIES = 20;
const EMPTY: IdentitySettings = { items: [], defaultAddress: "" };

const hasControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32 || s.charCodeAt(i) === 127) return true;
  return false;
};

/** 화면(또는 파일)에서 온 값을 검사해 정리한다. 형식이 틀리면 이유를 돌려준다 */
export function parseIdentitySettings(v: unknown): { ok: true; value: IdentitySettings } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null) return { ok: false, error: "보내는 사람 설정 형식이 올바르지 않습니다." };
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.items) || o.items.length > MAX_IDENTITIES) return { ok: false, error: `보내는 사람은 ${MAX_IDENTITIES}개까지 등록할 수 있습니다.` };
  const seen = new Set<string>();
  const items: SenderIdentity[] = [];
  for (const raw of o.items) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: "보내는 사람 설정 형식이 올바르지 않습니다." };
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : null;
    const address = typeof r.address === "string" ? r.address.trim() : null;
    if (name === null || address === null) return { ok: false, error: "이름과 주소를 모두 입력해 주세요." };
    if (name.length > 100 || hasControl(name) || /[<>"]/.test(name)) return { ok: false, error: "이름에 사용할 수 없는 문자가 있거나 너무 깁니다." };
    if (address.length > 254 || !isValidEmail(address)) return { ok: false, error: `올바르지 않은 메일 주소입니다: ${address.slice(0, 80)}` };
    const key = address.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `같은 주소가 두 번 있습니다: ${address}` };
    seen.add(key);
    items.push({ name, address });
  }
  const def = typeof o.defaultAddress === "string" ? o.defaultAddress.trim() : "";
  // 기본 주소는 등록된 주소 중에서만 (아니면 계정 주소를 기본으로)
  return { ok: true, value: { items, defaultAddress: seen.has(def.toLowerCase()) ? def : "" } };
}

export class IdentityStore {
  private readonly log: Logger;

  constructor(
    private readonly file: string,
    log?: Logger,
  ) {
    this.log = log ?? silentLogger;
  }

  load(): IdentitySettings {
    try {
      const parsed = parseIdentitySettings(JSON.parse(fs.readFileSync(this.file, "utf-8")));
      return parsed.ok ? parsed.value : EMPTY;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") this.log.warn(`[Mail] 보내는 사람 설정을 읽지 못해 비워 둡니다: ${(err as Error).message}`);
      return EMPTY;
    }
  }

  save(value: IdentitySettings): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
    fs.renameSync(tmp, this.file);
  }
}
