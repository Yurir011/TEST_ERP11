/**
 * 메일 기능 전체를 묶는 서비스 (main 프로세스 전용). 화면(IPC)은 이 서비스의 결과만 받는다.
 * 비밀번호는 이 파일 밖으로 나가지 않는다.
 */
import fs from "node:fs";
import path from "node:path";

import { type AddressObject, simpleParser } from "mailparser";

import { type Logger, silentLogger } from "../log";
import { type MailAccountStore, validateAccountInput } from "./account";
import { extractAddresses, isValidEmail } from "./address";
import { sanitizeEmailHtml } from "./html";
import { MailError, MailSync, findJunkFolder, findSentFolder, findTrashFolder } from "./sync";
import type { CachedBody, MailStore } from "./store";
import { ALL_MAIL_FOLDER, type MailAccountInfo, type MailAttachmentInfo, type MailContact, type MailDetail, type MailFilter, type MailFolder, type MailResult, type MailSummary, type NewMailInfo } from "./types";

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

  // ---- 주소록 (받는 사람 자동완성) ----

  /**
   * 메일을 보낸 적 있는 받는 사람들. 앱에서 보낸 메일(주소록 표)과, 이 PC 에 받아 둔 보낸메일함의 받는 사람을 합쳐 최근에 쓴 것부터 돌려준다.
   * 입력한 글이 있으면 이름이나 주소에 들어 있는 것만(시작하는 것을 먼저). 내 계정 주소와 목록에서 지운 주소는 뺀다.
   */
  contacts(query: string, limit: number): MailContact[] {
    const q = query.trim().toLowerCase();
    const me = this.deps.accounts.load()?.email.toLowerCase();
    const hidden = this.deps.store.hiddenContacts();
    const found = new Map<string, { name: string; address: string; at: number }>();
    const add = (name: string, address: string, at: number) => {
      const key = address.toLowerCase();
      if (key === me || hidden.has(key)) return;
      const old = found.get(key);
      if (!old) found.set(key, { name, address, at });
      else if (at > old.at) found.set(key, { name: name || old.name, address, at });
      else if (!old.name && name) old.name = name;
    };
    for (const r of this.deps.store.contactRows()) add(r.name, r.address, r.lastUsed);
    const sent = findSentFolder(this.deps.store.folders());
    if (sent) for (const row of this.deps.store.sentRecipientTexts(sent.path, 2000)) for (const a of extractAddresses(row.toText)) add(a.name, a.address, row.date);

    const rank = (c: { name: string; address: string }): number => {
      if (!q) return 0;
      const n = c.name.toLowerCase();
      const a = c.address.toLowerCase();
      if (n.startsWith(q) || a.startsWith(q)) return 0;
      return n.includes(q) || a.includes(q) ? 1 : 2;
    };
    return [...found.values()]
      .filter((c) => rank(c) < 2)
      .sort((x, y) => rank(x) - rank(y) || y.at - x.at)
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map(({ name, address }) => ({ name, address }));
  }

  /** 주소록에서 지운다 (다시 보내면 다시 나타난다) */
  removeContact(address: string): boolean {
    if (!isValidEmail(address)) return false;
    this.deps.store.hideContact(address, Date.now());
    return true;
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
    const f: MailFilter = { unread: filter.unread === true, flagged: filter.flagged === true, attachment: filter.attachment === true, query: typeof filter.query === "string" ? filter.query : undefined, ids: Array.isArray(filter.ids) ? filter.ids : undefined };
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

  /** 받은메일함의 안 읽은 메일 수 (이 PC 에 받아 둔 기준, 배지에 쓴다) */
  inboxUnread(): number {
    return this.deps.store.unreadTotal("INBOX");
  }

  // ---- 이동·삭제·스팸 ----

  /** 메일을 다른 폴더로 옮긴다. 이미 그 폴더에 있는 메일은 건드리지 않는다 */
  async move(ids: number[], dest: string): Promise<MailResult<{ moved: number }>> {
    if (!this.deps.store.hasFolder(dest)) return { ok: false, error: "도착 폴더를 찾을 수 없습니다." };
    return this.moveRows(ids, dest);
  }

  private async moveRows(ids: number[], dest: string): Promise<MailResult<{ moved: number }>> {
    const rows = this.deps.store.locate(ids).filter((r) => r.folder !== dest);
    const byFolder = new Map<string, number[]>();
    for (const r of rows) byFolder.set(r.folder, [...(byFolder.get(r.folder) ?? []), r.uid]);
    try {
      for (const [folder, uids] of byFolder) {
        await this.deps.sync.moveMessages(folder, uids, dest);
        this.deps.store.deleteUids(folder, uids); // 옮긴 메일은 이 폴더에서 사라진다 (도착 폴더에는 동기화로 들어온다)
      }
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "메일을 옮기지 못했습니다." };
    }
    if (rows.length > 0) {
      try {
        await this.deps.sync.syncFolder(dest); // 도착 폴더에 바로 보이게
      } catch {
        this.log.warn(`[Mail] 메일은 옮겼지만 도착 폴더(${dest})를 새로 읽지 못했습니다 (다음 동기화에서 보입니다)`);
      }
    }
    return { ok: true, value: { moved: rows.length } };
  }

  /**
   * 삭제. 기본은 휴지통으로 옮긴다(되살릴 수 있다). `permanent` 는 이미 휴지통·스팸메일함에 있는 메일을 서버에서 완전히 지울 때만 허용한다.
   * 휴지통 폴더를 찾지 못하면 지우지 않고 알린다 (조용히 완전 삭제로 바뀌는 일은 없다).
   */
  async remove(ids: number[], permanent = false): Promise<MailResult<{ trashed: number; deleted: number }>> {
    const folders = this.deps.store.folders();
    const trash = findTrashFolder(folders);
    if (permanent) {
      const allowed = new Set([trash?.path, findJunkFolder(folders)?.path].filter((p): p is string => !!p));
      const rows = this.deps.store.locate(ids);
      if (rows.some((r) => !allowed.has(r.folder))) return { ok: false, error: "휴지통(또는 스팸메일함)에 있는 메일만 완전히 삭제할 수 있습니다." };
      const byFolder = new Map<string, number[]>();
      for (const r of rows) byFolder.set(r.folder, [...(byFolder.get(r.folder) ?? []), r.uid]);
      try {
        for (const [folder, uids] of byFolder) {
          await this.deps.sync.deleteMessages(folder, uids);
          this.deps.store.deleteUids(folder, uids);
        }
      } catch (e) {
        return { ok: false, error: e instanceof MailError ? e.message : "메일을 지우지 못했습니다." };
      }
      return { ok: true, value: { trashed: 0, deleted: rows.length } };
    }
    if (!trash) return { ok: false, error: "휴지통 폴더를 찾을 수 없어 삭제하지 않았습니다. 메일 서버에 휴지통 폴더가 있는지 확인해 주세요." };
    const moved = await this.moveRows(ids, trash.path);
    return moved.ok ? { ok: true, value: { trashed: moved.value.moved, deleted: 0 } } : moved;
  }

  /** 스팸 신고: 스팸메일함으로 옮긴다 */
  async spam(ids: number[]): Promise<MailResult<{ moved: number }>> {
    const junk = findJunkFolder(this.deps.store.folders());
    if (!junk) return { ok: false, error: "스팸메일함 폴더를 찾을 수 없어 옮기지 못했습니다." };
    return this.moveRows(ids, junk.path);
  }

  // ---- 본문 검색 (서버) ----

  /** 서버에서 본문·제목·보낸 사람을 찾아, 이 PC 에 받아 둔 메일 중 해당하는 번호를 돌려준다 */
  async searchBody(folder: string, query: string): Promise<MailResult<{ ids: number[] }>> {
    const q = query.trim().slice(0, 100);
    if (!q) return { ok: true, value: { ids: [] } };
    const all = this.deps.store.folders();
    const skip = new Set([findTrashFolder(all)?.path, findJunkFolder(all)?.path]);
    const targets = folder === ALL_MAIL_FOLDER ? all.filter((f) => !skip.has(f.path)).map((f) => f.path) : [folder];
    const ids: number[] = [];
    let ok = 0;
    let lastError = "서버에서 검색하지 못했습니다.";
    for (const path of targets) {
      try {
        const uids = await this.deps.sync.searchBody(path, q);
        ids.push(...this.deps.store.idsByUids(path, uids));
        ok++;
      } catch (e) {
        if (e instanceof MailError) lastError = e.message;
        this.log.warn(`[Mail] 서버 검색 실패: ${path}`);
      }
    }
    if (ok === 0) return { ok: false, error: lastError };
    return { ok: true, value: { ids } };
  }

  // ---- 새 메일 확인 (주기적으로 불린다) ----

  /**
   * 받은메일함을 서버와 맞추고, 새로 도착한 안 읽은 메일 정보를 돌려준다.
   * 이 PC 에 받은메일함 메일이 하나도 없던 첫 동기화(처음 등록 직후)는 알림을 만들지 않는다 (예전 메일이 한꺼번에 알림으로 쏟아지는 것을 막는다).
   */
  async pollInbox(): Promise<MailResult<{ unread: number; newMail: NewMailInfo[]; changed: boolean }>> {
    if (!this.deps.accounts.load()) return { ok: true, value: { unread: 0, newMail: [], changed: false } };
    const first = this.deps.store.count("INBOX") === 0;
    try {
      const r = await this.deps.sync.syncFolderDetailed("INBOX");
      const fresh = first ? [] : this.deps.store.locate(this.deps.store.idsByUids("INBOX", r.addedUids)).filter((m) => !m.seen).map((m) => this.deps.store.get(m.id)!);
      const newMail = fresh
        .filter((m) => !!m)
        .sort((a, b) => b.date - a.date)
        .slice(0, 20)
        .map((m) => ({ id: m.id, from: m.fromName || m.fromAddr || "(보낸 사람 없음)", subject: m.subject.trim() || "(제목 없음)" }));
      return { ok: true, value: { unread: this.deps.store.unreadTotal("INBOX"), newMail, changed: r.added > 0 || r.removed > 0 } };
    } catch (e) {
      return { ok: false, error: e instanceof MailError ? e.message : "새 메일을 확인하지 못했습니다." };
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
