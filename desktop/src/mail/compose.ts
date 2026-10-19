/**
 * 메일 쓰기 (main 프로세스 전용): 새 메일·내게쓰기·답장·전체답장·전달의 초안 만들기, 첨부 파일 준비, 보내기.
 *
 * 첨부 파일은 화면이 파일 경로를 직접 넘기지 않는다. 사용자가 고른 파일(또는 전달할 원본 첨부)을 앱이 "준비"해서 번호(id)를 주고,
 * 화면은 그 번호만 돌려보낸다 → 화면이 임의의 파일을 읽어 보내게 만들 수 없다.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type AddressObject, simpleParser } from "mailparser";

import { type Logger, silentLogger } from "../log";
import type { MailAccountStore } from "./account";
import { type ParsedAddress, dedupeAddresses, parseAddressList } from "./address";
import type { MailSender } from "./send";
import { safeFilename } from "./service";
import { MailError, type MailSync } from "./sync";
import type { MailStore } from "./store";
import type { MailResult } from "./types";

export const MAX_RECIPIENTS = 50;
export const MAX_ATTACHMENTS = 20;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 첨부 합계 (서버 한도 약 70MB 보다 넉넉히 낮춘 값)
export const MAX_SUBJECT = 255;
export const MAX_BODY = 1_000_000;

export interface StagedAttachment {
  id: string;
  filename: string;
  size: number;
}

export interface Threading {
  inReplyTo?: string;
  references?: string[];
}

export type DraftKind = "reply" | "replyAll" | "forward" | "self";

export interface Draft {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: StagedAttachment[];
  threading?: Threading;
}

export interface SendPayload {
  fromName: string;
  /** 직접 입력한 보내는 사람 주소 (없으면 로그인한 계정 주소) */
  fromAddress?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachmentIds: string[];
  threading?: Threading;
}

export interface SendResult {
  messageId: string;
  /** 보낸메일함에 저장했는가. 설정이 꺼져 있으면 null */
  savedToSent: boolean | null;
}

interface Staged extends StagedAttachment {
  path: string;
  /** 앱이 임시로 만든 파일이면 보낸 뒤(또는 버릴 때) 지운다. 사용자가 고른 원본 파일은 절대 지우지 않는다 */
  temp: boolean;
}

export interface ComposeDeps {
  accounts: MailAccountStore;
  store: MailStore;
  sync: MailSync;
  sender: MailSender;
  /** 전달할 원본 첨부를 임시로 풀어 둘 폴더 */
  tempDir: string;
  log?: Logger;
}

const MESSAGE_ID = /^<[^<>\s\r\n]{1,300}>$/;

/** "Re: ", "Fwd: " 를 한 번만 붙인다 */
export function prefixSubject(subject: string, prefix: "Re: " | "Fwd: "): string {
  const re = prefix === "Re: " ? /^\s*(re|회신|답장)\s*:/i : /^\s*(fwd?|전달)\s*:/i;
  const s = subject.trim();
  return re.test(s) ? s : `${prefix}${s}`;
}

function oneLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").trim();
}

function quoteText(text: string): string {
  return text
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

const addressText = (a?: AddressObject | AddressObject[]): string => (a ? (Array.isArray(a) ? a : [a]).map((x) => x.text).join(", ") : "");

function formatAddress(a: { name?: string; address?: string }): string {
  if (!a.address) return "";
  return a.name ? `${a.name.replace(/[<>",;]/g, "")} <${a.address}>` : a.address;
}

export class MailComposer {
  private readonly staged = new Map<string, Staged>();
  private readonly log: Logger;

  constructor(private readonly deps: ComposeDeps) {
    this.log = deps.log ?? silentLogger;
  }

  // ---- 첨부 파일 준비 ----

  /** 사용자가 고른 파일들을 준비한다. 일반 파일만, 크기와 개수 한도를 지킨다 */
  stageFiles(paths: string[]): MailResult<StagedAttachment[]> {
    const out: StagedAttachment[] = [];
    for (const p of paths) {
      let st: fs.Stats;
      try {
        st = fs.statSync(p);
      } catch {
        return { ok: false, error: `파일을 읽을 수 없습니다: ${path.basename(p)}` };
      }
      if (!st.isFile()) return { ok: false, error: `파일이 아닙니다: ${path.basename(p)}` };
      if (st.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `파일이 너무 큽니다(최대 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB): ${path.basename(p)}` };
      const entry: Staged = { id: randomUUID(), filename: safeFilename(path.basename(p)), size: st.size, path: p, temp: false };
      this.staged.set(entry.id, entry);
      out.push({ id: entry.id, filename: entry.filename, size: entry.size });
    }
    return { ok: true, value: out };
  }

  private stageBuffer(filename: string, content: Buffer): StagedAttachment {
    const id = randomUUID();
    const dir = path.join(this.deps.tempDir, id);
    fs.mkdirSync(dir, { recursive: true });
    const name = safeFilename(filename);
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    this.staged.set(id, { id, filename: name, size: content.length, path: file, temp: true });
    return { id, filename: name, size: content.length };
  }

  /** ERP 문서(PDF)를 첨부로 준비한다. 앱이 임시 파일로 만들고 보낸 뒤(또는 버릴 때) 지운다 */
  stageDocument(filename: string, content: Buffer): MailResult<StagedAttachment> {
    if (content.length === 0) return { ok: false, error: "문서 파일이 비어 있습니다." };
    if (content.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: `문서 파일이 너무 큽니다(최대 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB).` };
    if (content.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, error: "PDF 문서만 첨부할 수 있습니다." };
    const name = safeFilename(filename);
    return { ok: true, value: this.stageBuffer(/\.pdf$/i.test(name) ? name : `${name}.pdf`, content) };
  }

  /** 준비한 첨부를 버린다 (임시로 만든 파일만 지운다) */
  discard(ids: string[]): void {
    for (const id of ids) {
      const s = this.staged.get(id);
      if (!s) continue;
      this.staged.delete(id);
      if (s.temp) fs.rmSync(path.dirname(s.path), { recursive: true, force: true });
    }
  }

  // ---- 초안 ----

  async draft(kind: DraftKind, id?: number): Promise<MailResult<Draft>> {
    const account = this.deps.accounts.load();
    if (!account) return { ok: false, error: "메일 계정이 등록되어 있지 않습니다." };
    if (kind === "self") return { ok: true, value: { to: account.email, cc: "", subject: "", body: "", attachments: [] } };

    const row = id ? this.deps.store.get(id) : null;
    if (!row) return { ok: false, error: "원본 메일을 찾을 수 없습니다." };
    try {
      const parsed = await simpleParser(await this.deps.sync.fetchSource(row.folder, row.uid));
      const original = parsed.text ?? "";
      const when = parsed.date ? parsed.date.toLocaleString("ko-KR") : "";
      const fromText = addressText(parsed.from);
      const subject = oneLine(parsed.subject ?? row.subject);

      if (kind === "forward") {
        const attachments = parsed.attachments.filter((a) => !(a.cid && a.contentDisposition !== "attachment")).slice(0, MAX_ATTACHMENTS).map((a) => this.stageBuffer(a.filename ?? "attachment", a.content));
        const head = ["---------- 전달된 메일 ----------", `보낸 사람: ${fromText}`, `날짜: ${when}`, `제목: ${subject}`, `받는 사람: ${addressText(parsed.to)}`, ""].join("\n");
        return { ok: true, value: { to: "", cc: "", subject: prefixSubject(subject, "Fwd: "), body: `\n\n${head}\n${original}`, attachments } };
      }

      const me = account.email.toLowerCase();
      const replyTarget = parsed.replyTo?.value[0] ?? parsed.from?.value[0];
      const to: ParsedAddress[] = replyTarget?.address ? [{ name: replyTarget.name ?? "", address: replyTarget.address }] : [];
      let cc: ParsedAddress[] = [];
      if (kind === "replyAll") {
        const others = [...(parsed.to ? [parsed.to].flat() : []), ...(parsed.cc ? [parsed.cc].flat() : [])].flatMap((x) => x.value);
        const toKeys = new Set(to.map((a) => a.address.toLowerCase()));
        cc = dedupeAddresses(others.filter((a) => a.address && a.address.toLowerCase() !== me && !toKeys.has(a.address.toLowerCase())).map((a) => ({ name: a.name ?? "", address: a.address! })));
      }
      const msgId = parsed.messageId && MESSAGE_ID.test(parsed.messageId) ? parsed.messageId : undefined;
      const refs = [...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []), ...(msgId ? [msgId] : [])].filter((r) => MESSAGE_ID.test(r));
      const threading: Threading = { inReplyTo: msgId, references: refs.slice(-10) };
      const head = `${when} ${fromText} 님이 작성:`;
      return {
        ok: true,
        value: {
          to: to.map(formatAddress).join(", "),
          cc: cc.map(formatAddress).join(", "),
          subject: prefixSubject(subject, "Re: "),
          body: `\n\n${head}\n${quoteText(original)}`,
          attachments: [],
          threading,
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "원본 메일을 불러오지 못했습니다." };
    }
  }

  // ---- 보내기 ----

  async send(payload: SendPayload): Promise<MailResult<SendResult>> {
    const account = this.deps.accounts.load();
    if (!account) return { ok: false, error: "메일 계정이 등록되어 있지 않습니다." };

    let fromAddress: string | undefined;
    if (payload.fromAddress !== undefined && payload.fromAddress.trim() !== "") {
      const f = parseAddressList(payload.fromAddress, 1);
      if (!f.ok || f.value.length !== 1) return { ok: false, error: "보내는 사람 주소가 올바르지 않습니다." };
      fromAddress = f.value[0].address;
    }

    const to = parseAddressList(payload.to, MAX_RECIPIENTS);
    if (!to.ok) return { ok: false, error: to.error };
    const cc = parseAddressList(payload.cc, MAX_RECIPIENTS);
    if (!cc.ok) return { ok: false, error: cc.error };
    const bcc = parseAddressList(payload.bcc, MAX_RECIPIENTS);
    if (!bcc.ok) return { ok: false, error: bcc.error };
    const recipients = dedupeAddresses([...to.value, ...cc.value, ...bcc.value]);
    if (recipients.length === 0) return { ok: false, error: "받는 사람을 입력해 주세요." };
    if (recipients.length > MAX_RECIPIENTS) return { ok: false, error: `받는 사람은 모두 합해 ${MAX_RECIPIENTS}명까지 보낼 수 있습니다.` };

    const subject = oneLine(payload.subject).slice(0, MAX_SUBJECT);
    if (payload.subject.length > MAX_SUBJECT * 2) return { ok: false, error: `제목이 너무 깁니다(${MAX_SUBJECT}자까지).` };
    if (payload.body.length > MAX_BODY) return { ok: false, error: "본문이 너무 깁니다." };
    if (payload.attachmentIds.length > MAX_ATTACHMENTS) return { ok: false, error: `첨부 파일은 ${MAX_ATTACHMENTS}개까지 보낼 수 있습니다.` };

    const attachments: Staged[] = [];
    let total = 0;
    for (const aid of payload.attachmentIds) {
      const s = this.staged.get(aid);
      if (!s || !fs.existsSync(s.path)) return { ok: false, error: "첨부 파일을 찾을 수 없습니다. 파일을 다시 첨부해 주세요." };
      total += fs.statSync(s.path).size;
      attachments.push(s);
    }
    if (total > MAX_ATTACHMENT_BYTES) return { ok: false, error: `첨부 파일 크기의 합이 너무 큽니다(최대 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB).` };

    const fromName = oneLine(payload.fromName).replace(/[<>"]/g, "").slice(0, 100);
    const t = payload.threading;
    const inReplyTo = t?.inReplyTo && MESSAGE_ID.test(t.inReplyTo) ? t.inReplyTo : undefined;
    const references = (t?.references ?? []).filter((r) => MESSAGE_ID.test(r)).slice(-10);

    try {
      const sent = await this.deps.sender.send({
        fromName,
        fromAddress,
        // 같은 사람이 받는 사람·참조·숨은참조에 중복되면 받는 사람 칸을 우선한다
        to: dedupeAddresses(to.value),
        cc: dedupeAddresses(cc.value).filter((a) => !to.value.some((x) => x.address.toLowerCase() === a.address.toLowerCase())),
        bcc: dedupeAddresses(bcc.value).filter((a) => ![...to.value, ...cc.value].some((x) => x.address.toLowerCase() === a.address.toLowerCase())),
        subject: subject || "(제목 없음)",
        text: payload.body.replace(/\r\n|\r|\n/g, "\r\n"),
        attachments: attachments.map((a) => ({ filename: a.filename, path: a.path })),
        inReplyTo,
        references: references.length ? references : undefined,
      });

      let savedToSent: boolean | null = null;
      // 서버는 보통 로그인한 계정 주소로 보낸 메일만 보낸메일함에 자동으로 남긴다. 다른 주소(별칭)로 보낸 메일은 남지 않으므로 설정과 상관없이 앱이 직접 저장한다.
      const otherSender = fromAddress !== undefined && fromAddress.toLowerCase() !== account.email.toLowerCase();
      if (account.saveToSent || otherSender) {
        try {
          savedToSent = await this.deps.sync.appendToSent(sent.raw);
        } catch {
          savedToSent = false;
          this.log.warn("[Mail] 보낸 메일은 보냈지만 보낸메일함에 저장하지 못했습니다");
        }
      }
      this.discard(payload.attachmentIds);
      return { ok: true, value: { messageId: sent.messageId, savedToSent } };
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "메일을 보내지 못했습니다." };
    }
  }
}
