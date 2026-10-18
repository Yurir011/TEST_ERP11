import { apiPost, fetchFileBytes } from "../../lib/api";
import type { MailBridge, MailDocRef } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";

export type DocumentMailResult = { ok: true } | { ok: false; error: string };

export interface DocumentMailInput {
  bridge: MailBridge;
  doc: MailDocRef;
  /** 문서 PDF 를 받는 서버 주소 */
  pdfPath: string;
  filename: string;
  to: string;
  subject: string;
  body: string;
}

/** 앱에서만 문서를 메일로 보낼 수 있다 (브라우저에는 이 기능이 없다) */
export function canComposeDocumentMail(bridge: MailBridge | undefined): bridge is MailBridge {
  return typeof bridge?.composeDocument === "function";
}

/** 문서 PDF 를 받아 메일 창의 쓰기 화면을 연다 (받는 사람·제목·본문은 초안으로 채워지고 직원이 고친 뒤 보낸다) */
export async function openDocumentMail(input: DocumentMailInput): Promise<DocumentMailResult> {
  logDebug("Mail", `문서 메일 쓰기 열기: ${input.doc.type}#${input.doc.id}`);
  try {
    const data = await fetchFileBytes(input.pdfPath);
    const r = await input.bridge.composeDocument({ to: input.to, subject: input.subject, body: input.body, doc: input.doc, filename: input.filename, data });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true };
  } catch (err) {
    logError("Mail", "문서 메일 쓰기를 열지 못했습니다", err);
    return { ok: false, error: "문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
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

/** 문서 메일을 보낸 직후 서버에 발송 이력(받는 사람·제목)만 알린다. 실패해도 메일 발송 자체에는 영향이 없다 */
export async function reportDocumentMailSent(doc: MailDocRef, fields: { to: string; cc: string; bcc: string; subject: string }): Promise<boolean> {
  const to = extractEmails(fields.to, fields.cc, fields.bcc).slice(0, 50);
  if (to.length === 0) return false;
  try {
    await apiPost("/api/mail/sent", { doc_type: doc.type, doc_id: doc.id, to, subject: fields.subject.slice(0, 255) });
    logDebug("Mail", `발송 이력 보고: ${doc.type}#${doc.id}`);
    return true;
  } catch (err) {
    logError("Mail", "발송 이력을 서버에 남기지 못했습니다", err);
    return false;
  }
}
