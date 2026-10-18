/**
 * 받는 사람 입력 해석. "홍길동 <hong@a.co>", "hong@a.co", 여러 명을 쉼표·세미콜론·줄바꿈으로 구분한 글을 받는다.
 * 줄바꿈이나 제어 문자를 이용한 헤더 끼워 넣기(헤더 인젝션)를 막기 위해, 주소 칸에는 한 줄짜리 정상 주소만 통과시킨다.
 */

export interface ParsedAddress {
  name: string;
  address: string;
}

export type AddressListResult = { ok: true; value: ParsedAddress[] } | { ok: false; error: string };

// 메일 주소: 앞부분은 영문·숫자·흔한 기호, 뒷부분(도메인)은 글자·숫자·하이픈이 점으로 이어진 형태(한글 도메인 허용)
const LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;

export function isValidEmail(address: string): boolean {
  if (address.length > 254) return false;
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((l) => DOMAIN_LABEL.test(l));
}

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32 || s.charCodeAt(i) === 127) return true;
  return false;
}

/** 따옴표 밖의 쉼표·세미콜론·줄바꿈으로 나눈다 (이름에 쉼표가 있어도 따옴표 안이면 나누지 않는다) */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle = true;
    else if (!quoted && ch === ">") angle = false;
    if (!quoted && !angle && (ch === "," || ch === ";" || ch === "\n")) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseAddressList(text: unknown, max = 50): AddressListResult {
  if (typeof text !== "string") return { ok: false, error: "받는 사람 형식이 올바르지 않습니다." };
  // 줄바꿈은 구분자로만 허용하고, 그 외 제어 문자(탭 포함)는 거절한다
  const normalized = text.replace(/\r\n|\r/g, "\n");
  if (hasControlChars(normalized.replace(/\n/g, ""))) return { ok: false, error: "받는 사람에 사용할 수 없는 문자가 있습니다." };

  const out: ParsedAddress[] = [];
  for (const token of splitList(normalized)) {
    const m = /^(.*?)<\s*([^<>]+?)\s*>$/.exec(token);
    const name = m ? m[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
    const address = (m ? m[2] : token).trim();
    if (!isValidEmail(address)) return { ok: false, error: `올바르지 않은 메일 주소입니다: ${token.slice(0, 80)}` };
    if (name.length > 200) return { ok: false, error: "받는 사람 이름이 너무 깁니다." };
    out.push({ name, address });
  }
  if (out.length > max) return { ok: false, error: `받는 사람은 한 번에 ${max}명까지 입력할 수 있습니다.` };
  return { ok: true, value: out };
}

/** 같은 주소(대소문자 무시)는 한 번만 남긴다 */
export function dedupeAddresses(list: ParsedAddress[]): ParsedAddress[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = a.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
