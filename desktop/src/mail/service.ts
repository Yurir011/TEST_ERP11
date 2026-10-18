/**
 * 메일 기능 전체를 묶는 서비스 (main 프로세스 전용). 화면(IPC)은 이 서비스의 결과만 받는다.
 * 비밀번호는 이 파일 밖으로 나가지 않는다.
 */
import fs from "node:fs";
import path from "node:path";

import { type AddressObject, simpleParser } from "mailparser";

import { type Logger, silentLogger } from "../log";
import { type MailAccountStore, validateAccountInput } from "./account";
import { sanitizeEmailHtml } from "./html";
import { MailError, MailSync } from "./sync";
import type { CachedBody, MailStore } from "./store";
import { ALL_MAIL_FOLDER, type MailAccountInfo, type MailAttachmentInfo, type MailDetail, type MailFilter, type MailFolder, type MailResult, type MailSummary } from "./types";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_INLINE_IMAGE_BYTES = 1_000_000;
const PAGE_MAX = 200;

/** 실행되면 위험한 파일 확장자 (열기 전에 한 번 더 묻는다) */
const DANGEROUS_EXT = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".msp", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".lnk", ".jar", ".reg", ".hta", ".cpl", ".dll", ".sys", ".pif", ".gadget", ".application", ".appx", ".msix",
]);

export function isDangerousFilename(name: string): boolean {
  const lower = name.toLowerCase().trim();
  // 마지막 확장자뿐 아니라 "문서.pdf.exe" 처럼 이중 확장자 속임수도 마지막 확장자로 걸러진다
  return DANGEROUS_EXT.has(path.extname(lower));
}

/** 저장할 때 쓸 파일 이름: 경로 구분자와 사용할 수 없는 글자를 없앤다 */
export function safeFilename(name: string, fallback = "attachment"): string {
  const base = path.basename(String(name).replace(/\\/g, "/"));
  const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").trim();
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned.slice(0, 200) : fallback;
}

function addressText(a: AddressObject | AddressObject[] | undefined): string {
  if (!a) return "";
  const list = Array.isArray(a) ? a : [a];
  return list.map((x) => x.text).filter(Boolean).join(", ");
}

interface ParsedMail {
  body: CachedBody;
}

export interface MailServiceDeps {
  accounts: MailAccountStore;
  store: MailStore;
  sync: MailSync;
  log?: Logger;
}

export class MailService {
  private readonly log: Logger;

  constructor(private readonly deps: MailServiceDeps) {
    this.log = deps.log ?? silentLogger;
  }

  // ---- 계정 ----

  accountInfo(): MailAccountInfo | null {
    return this.deps.accounts.load();
  }

  async saveAccount(input: unknown): Promise<MailResult<MailAccountInfo>> {
    const v = validateAccountInput(input);
    if (!v.ok) return v;
    try {
      await this.deps.sync.testConnection(v.value);
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "접속을 확인하지 못했습니다." };
    }
    const saved = this.deps.accounts.save(v.value);
    if (!saved.ok) return saved;
    const { password: _pw, ...info } = v.value;
    void _pw;
    return { ok: true, value: info };
  }

  removeAccount(): void {
    this.deps.accounts.remove();
  }

  // ---- 폴더·목록 ----

  folders(): MailFolder[] {
    return this.deps.store.folders();
  }

  async sync(folder: string): Promise<MailResult<{ added: number; removed: number }>> {
    try {
      return { ok: true, value: folder === ALL_MAIL_FOLDER ? await this.deps.sync.syncAll() : await this.deps.sync.syncFolder(folder) };
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "동기화하지 못했습니다." };
    }
  }

  list(folder: string, offset: number, limit: number, filter: MailFilter = {}): { items: MailSummary[]; total: number } {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 50, PAGE_MAX));
    const f: MailFilter = { unread: filter.unread === true, flagged: filter.flagged === true, attachment: filter.attachment === true, query: typeof filter.query === "string" ? filter.query : undefined };
    return { items: this.deps.store.list(folder, safeLimit, Math.max(0, Math.trunc(offset) || 0), f), total: this.deps.store.count(folder, f) };
  }

  // ---- 본문 ----

  async get(id: number, options: { allowRemoteImages?: boolean } = {}): Promise<MailResult<MailDetail>> {
    const row = this.deps.store.get(id);
    if (!row) return { ok: false, error: "메일을 찾을 수 없습니다." };
    let body = row.body;
    if (!body) {
      try {
        body = (await this.fetchAndParse(row.folder, row.uid)).body;
        this.deps.store.setBody(id, body);
      } catch (e) {
        return { ok: false, error: e instanceof MailError ? e.message : "메일 본문을 내려받지 못했습니다." };
      }
    }
    const safe = body.html ? sanitizeEmailHtml(body.html, { allowRemoteImages: options.allowRemoteImages === true }) : null;
    const { toText, body: _b, ...summary } = row;
    void _b;
    if (!row.seen) await this.markSeen(id, true);
    return {
      ok: true,
      value: {
        ...summary,
        seen: true,
        to: toText,
        cc: body.cc,
        text: body.text,
        html: safe ? safe.html : null,
        remoteImagesBlocked: safe ? safe.remoteImagesBlocked : false,
        attachments: body.attachments,
      },
    };
  }

  /** 읽음 표시: 로컬에 먼저 반영하고 서버에도 알린다(서버 실패는 로그만 남기고 다음 동기화에서 맞춘다) */
  async markSeen(id: number, seen: boolean): Promise<void> {
    const row = this.deps.store.get(id);
    if (!row) return;
    this.deps.store.setSeen(id, seen);
    try {
      await this.deps.sync.setSeenOnServer(row.folder, row.uid, seen);
    } catch {
      this.log.warn(`[Mail] 서버에 읽음 표시를 알리지 못함: id=${id} (다음 동기화에서 서버 값으로 다시 맞춰집니다)`);
    }
  }

  /** 별표(중요) 표시: 읽음 표시와 같은 방식 */
  async setFlagged(id: number, flagged: boolean): Promise<void> {
    const row = this.deps.store.get(id);
    if (!row) return;
    this.deps.store.setFlagged(id, flagged);
    try {
      await this.deps.sync.setFlaggedOnServer(row.folder, row.uid, flagged);
    } catch {
      this.log.warn(`[Mail] 서버에 별표 표시를 알리지 못함: id=${id} (다음 동기화에서 서버 값으로 다시 맞춰집니다)`);
    }
  }

  // ---- 첨부 ----

  /** 첨부 파일 내용을 파일로 쓴다. 저장 위치는 호출한 쪽(사용자가 고른 위치)이 정한다. */
  async writeAttachment(id: number, index: number, destination: string): Promise<MailResult<{ filename: string }>> {
    const row = this.deps.store.get(id);
    if (!row) return { ok: false, error: "메일을 찾을 수 없습니다." };
    try {
      const source = await this.deps.sync.fetchSource(row.folder, row.uid);
      const parsed = await simpleParser(source);
      const att = parsed.attachments.filter((a) => !isInlineImage(a))[index];
      if (!att) return { ok: false, error: "첨부 파일을 찾을 수 없습니다." };
      fs.writeFileSync(destination, att.content);
      return { ok: true, value: { filename: att.filename ?? "attachment" } };
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "첨부 파일을 저장하지 못했습니다." };
    }
  }

  attachmentInfo(id: number, index: number): MailAttachmentInfo | null {
    return this.deps.store.get(id)?.body?.attachments[index] ?? null;
  }

  // ---- 내부 ----

  private async fetchAndParse(folder: string, uid: number): Promise<ParsedMail> {
    const source = await this.deps.sync.fetchSource(folder, uid);
    const parsed = await simpleParser(source);

    // 본문 속 그림(cid:)은 작은 이미지만 data 주소로 바꿔 넣는다. 나머지 cid 는 sanitize 단계에서 제거된다.
    let html = typeof parsed.html === "string" ? parsed.html : null;
    if (html) {
      for (const a of parsed.attachments) {
        if (!isInlineImage(a) || !a.cid || a.size > MAX_INLINE_IMAGE_BYTES) continue;
        const dataUrl = `data:${a.contentType};base64,${a.content.toString("base64")}`;
        html = html.split(`cid:${a.cid}`).join(dataUrl);
      }
    }

    const attachments: MailAttachmentInfo[] = [];
    let index = 0;
    for (const a of parsed.attachments) {
      if (isInlineImage(a)) continue;
      attachments.push({ index: index++, filename: a.filename ?? "attachment", contentType: a.contentType, size: a.size });
    }
    return {
      body: {
        text: parsed.text ?? "",
        html,
        cc: addressText(parsed.cc),
        attachments,
      },
    };
  }
}

function isInlineImage(a: { contentDisposition?: string; contentType: string; cid?: string }): boolean {
  return !!a.cid && a.contentDisposition !== "attachment" && INLINE_IMAGE_TYPES.has(a.contentType.toLowerCase());
}
