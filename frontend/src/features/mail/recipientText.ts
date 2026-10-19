import type { MailContact } from "../../lib/desktop";

/** 입력칸에서 지금 쓰고 있는 마지막 주소 조각의 시작 위치 (쉼표·세미콜론 다음) */
export function currentTokenStart(text: string): number {
  return Math.max(text.lastIndexOf(","), text.lastIndexOf(";")) + 1;
}

/** 고른 연락처로 마지막 조각을 바꾼 새 입력 글 ("이름 <주소>, " 형태로 끝나 바로 다음 사람을 쓸 수 있다) */
export function applyContact(text: string, contact: MailContact): string {
  const head = text.slice(0, currentTokenStart(text)).replace(/\s+$/, "");
  const name = contact.name.replace(/[<>",;]/g, "").trim();
  const entry = name ? `${name} <${contact.address}>` : contact.address;
  return `${head ? `${head} ` : ""}${entry}, `;
}

/** 주소 문자열("홍길동 <a@x.com>, b@y.com")에서 이메일 주소만 뽑는다 (중복 제거, 소문자 비교) */
export function extractEmails(...fields: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of fields) {
    for (const m of field.matchAll(/[^\s<>,;"']+@[^\s<>,;"']+/g)) {
      const addr = m[0].replace(/^[([]+|[)\].]+$/g, "");
      const key = addr.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(addr);
      }
    }
  }
  return out;
}

/** 여러 연락처를 입력 글 끝에 덧붙인다 ("이름 <주소>, " 형태). 이미 들어 있는 주소는 건너뛴다 */
export function appendContacts(text: string, contacts: MailContact[]): string {
  const have = new Set(extractEmails(text).map((a) => a.toLowerCase()));
  let out = text.trim() === "" ? "" : text.replace(/[\s,;]+$/, "") + ", ";
  for (const c of contacts) {
    if (have.has(c.address.toLowerCase())) continue;
    have.add(c.address.toLowerCase());
    const name = c.name.replace(/[<>",;]/g, "").trim();
    out += `${name ? `${name} <${c.address}>` : c.address}, `;
  }
  return out;
}
