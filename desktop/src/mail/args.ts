import type { DraftKind, SendPayload, Threading } from "./compose";
import type { MailFilter } from "./types";

/** 화면(IPC)에서 온 값 검사. 형식이 맞지 않으면 null 을 돌려 주고 호출한 쪽에서 무시한다. */

export function parseMailId(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** 폴더 경로: 1~255자, 제어 문자 없음 */
export function parseFolderPath(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 1 || v.length > 255) return null;
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32) return null;
  return v;
}

export function parseAttachmentIndex(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < 1000 ? v : null;
}

/** 목록 조건: 알려진 키만, 형식이 맞는 값만 받는다 */
export function parseFilter(v: unknown): MailFilter {
  if (typeof v !== "object" || v === null) return {};
  const o = v as Record<string, unknown>;
  const f: MailFilter = {};
  if (o.unread === true) f.unread = true;
  if (o.flagged === true) f.flagged = true;
  if (o.attachment === true) f.attachment = true;
  if (typeof o.query === "string" && o.query.trim()) f.query = o.query.trim().slice(0, 100);
  return f;
}

export function parsePaging(offset: unknown, limit: unknown): { offset: number; limit: number } {
  const o = typeof offset === "number" && Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const l = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 200)) : 50;
  return { offset: o, limit: l };
}

export function parseDraftKind(v: unknown): DraftKind | null {
  return v === "reply" || v === "replyAll" || v === "forward" || v === "self" ? v : null;
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

/** 보내기 요청의 형식 검사 (내용 검사 — 주소·한도 — 는 보내는 쪽에서 한다) */
export function parseSendPayload(v: unknown): SendPayload | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const fromName = str(o.fromName, 200);
  const to = str(o.to, 20_000);
  const cc = str(o.cc, 20_000);
  const bcc = str(o.bcc, 20_000);
  const subject = str(o.subject, 2_000);
  const body = str(o.body, 2_000_000);
  if (fromName === null || to === null || cc === null || bcc === null || subject === null || body === null) return null;
  if (!Array.isArray(o.attachmentIds) || o.attachmentIds.length > 50 || !o.attachmentIds.every((x) => typeof x === "string" && x.length <= 64)) return null;
  let threading: Threading | undefined;
  if (o.threading !== undefined && o.threading !== null) {
    if (typeof o.threading !== "object") return null;
    const t = o.threading as Record<string, unknown>;
    const inReplyTo = t.inReplyTo === undefined ? undefined : str(t.inReplyTo, 400);
    if (inReplyTo === null) return null;
    let references: string[] | undefined;
    if (t.references !== undefined) {
      if (!Array.isArray(t.references) || t.references.length > 20 || !t.references.every((x) => typeof x === "string" && x.length <= 400)) return null;
      references = t.references as string[];
    }
    threading = { inReplyTo, references };
  }
  return { fromName, to, cc, bcc, subject, body, attachmentIds: o.attachmentIds as string[], threading };
}
