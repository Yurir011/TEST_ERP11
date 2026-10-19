/**
 * 로컬 메일 저장소 (main 프로세스 전용). 이 PC 의 SQLite 파일에만 있고 서버로 가지 않는다.
 * 목록은 헤더만 저장하고, 본문은 메일을 열 때 내려받아 캐시한다.
 */
import Database from "better-sqlite3";

import { ALL_MAIL_FOLDER, type MailAttachmentInfo, type MailFilter, type MailFolder, type MailSummary } from "./types";

const SCHEMA_VERSION = 2;

export interface FolderRecord {
  path: string;
  name: string;
  specialUse: string | null;
  uidValidity: string | null;
}

export interface NewMessage {
  folder: string;
  uid: number;
  subject: string;
  fromName: string;
  fromAddr: string;
  toText: string;
  date: number;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}

export interface CachedBody {
  text: string;
  html: string | null;
  cc: string;
  attachments: MailAttachmentInfo[];
}

interface MessageRow {
  id: number;
  folder: string;
  uid: number;
  subject: string;
  from_name: string;
  from_addr: string;
  to_text: string;
  date: number;
  seen: number;
  flagged: number;
  has_attachments: number;
  body_text: string | null;
  body_html: string | null;
  cc_text: string | null;
  attachments_json: string | null;
}

function toSummary(r: MessageRow): MailSummary {
  return {
    id: r.id,
    folder: r.folder,
    uid: r.uid,
    subject: r.subject,
    fromName: r.from_name,
    fromAddr: r.from_addr,
    date: r.date,
    seen: r.seen === 1,
    flagged: r.flagged === 1,
    hasAttachments: r.has_attachments === 1,
  };
}

export class MailStore {
  private readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const current = this.db.pragma("user_version", { simple: true }) as number;
    if (current > SCHEMA_VERSION) throw new Error(`메일 저장소가 더 새로운 버전(${current})입니다`);
    if (current < 1) {
      this.db.exec(`
        CREATE TABLE folders (
          path TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          special_use TEXT,
          uid_validity TEXT
        );
        CREATE TABLE messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          folder TEXT NOT NULL REFERENCES folders(path) ON DELETE CASCADE,
          uid INTEGER NOT NULL,
          subject TEXT NOT NULL DEFAULT '',
          from_name TEXT NOT NULL DEFAULT '',
          from_addr TEXT NOT NULL DEFAULT '',
          to_text TEXT NOT NULL DEFAULT '',
          date INTEGER NOT NULL,
          seen INTEGER NOT NULL DEFAULT 0,
          flagged INTEGER NOT NULL DEFAULT 0,
          has_attachments INTEGER NOT NULL DEFAULT 0,
          body_text TEXT,
          body_html TEXT,
          cc_text TEXT,
          attachments_json TEXT,
          UNIQUE (folder, uid)
        );
        CREATE INDEX idx_messages_folder_date ON messages (folder, date DESC);
      `);
    }
    if (current < 2) {
      // 주소록: 메일을 보낸 적 있는 받는 사람 (hidden 은 사용자가 목록에서 지운 주소 → 보낸메일함에서 다시 뽑아도 나타나지 않는다)
      this.db.exec(`
        CREATE TABLE contacts (
          address TEXT PRIMARY KEY COLLATE NOCASE,
          name TEXT NOT NULL DEFAULT '',
          last_used INTEGER NOT NULL,
          use_count INTEGER NOT NULL DEFAULT 1,
          hidden INTEGER NOT NULL DEFAULT 0
        );
      `);
    }
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  // ---- 주소록 ----

  /** 보낸 메일의 받는 사람들을 주소록에 올린다 (이미 있으면 이름·마지막 사용 시각·횟수를 갱신하고, 지웠던 주소도 다시 나타난다) */
  recordContacts(list: { name: string; address: string }[], now: number): void {
    const upsert = this.db.prepare(
      `INSERT INTO contacts (address, name, last_used, use_count, hidden) VALUES (@address, @name, @now, 1, 0)
       ON CONFLICT(address) DO UPDATE SET
         address = excluded.address,
         name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE contacts.name END,
         last_used = excluded.last_used, use_count = contacts.use_count + 1, hidden = 0`,
    );
    this.db.transaction((rows: { name: string; address: string }[]) => {
      for (const r of rows) upsert.run({ address: r.address, name: r.name, now });
    })(list);
  }

  /** 주소록(지우지 않은 것) 전체 */
  contactRows(): { address: string; name: string; lastUsed: number; useCount: number }[] {
    return (this.db.prepare("SELECT address, name, last_used AS lastUsed, use_count AS useCount FROM contacts WHERE hidden = 0").all() as { address: string; name: string; lastUsed: number; useCount: number }[]);
  }

  /** 주소록에서 지운 주소들 (보낸메일함에서 뽑은 후보에서도 뺀다) */
  hiddenContacts(): Set<string> {
    return new Set((this.db.prepare("SELECT address FROM contacts WHERE hidden = 1").all() as { address: string }[]).map((r) => r.address.toLowerCase()));
  }

  /** 주소록에서 지운다 (지운 표시를 남겨 다시 나타나지 않게 한다) */
  hideContact(address: string, now: number): void {
    this.db
      .prepare(`INSERT INTO contacts (address, name, last_used, use_count, hidden) VALUES (?, '', ?, 0, 1) ON CONFLICT(address) DO UPDATE SET hidden = 1`)
      .run(address, now);
  }

  /** 보낸메일함 메일의 받는 사람 글(최근 것부터) */
  sentRecipientTexts(sentFolder: string, limit: number): { toText: string; date: number }[] {
    return this.db.prepare("SELECT to_text AS toText, date FROM messages WHERE folder = ? AND to_text <> '' ORDER BY date DESC LIMIT ?").all(sentFolder, limit) as { toText: string; date: number }[];
  }

  // ---- 폴더 ----

  replaceFolders(folders: FolderRecord[]): void {
    const upsert = this.db.prepare(
      `INSERT INTO folders (path, name, special_use, uid_validity) VALUES (@path, @name, @specialUse, @uidValidity)
       ON CONFLICT(path) DO UPDATE SET name = excluded.name, special_use = excluded.special_use`,
    );
    const tx = this.db.transaction((list: FolderRecord[]) => {
      for (const f of list) upsert.run({ ...f, uidValidity: f.uidValidity ?? null });
      const keep = new Set(list.map((f) => f.path));
      for (const row of this.db.prepare("SELECT path FROM folders").all() as { path: string }[]) {
        if (!keep.has(row.path)) this.db.prepare("DELETE FROM folders WHERE path = ?").run(row.path);
      }
    });
    tx(folders);
  }

  folders(): MailFolder[] {
    const rows = this.db
      .prepare(
        `SELECT f.path, f.name, f.special_use AS specialUse,
                COALESCE(SUM(CASE WHEN m.seen = 0 THEN 1 ELSE 0 END), 0) AS unread, COUNT(m.id) AS total
         FROM folders f LEFT JOIN messages m ON m.folder = f.path GROUP BY f.path`,
      )
      .all() as MailFolder[];
    return rows;
  }

  hasFolder(path: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM folders WHERE path = ?").get(path);
  }

  uidValidity(folder: string): string | null {
    const r = this.db.prepare("SELECT uid_validity AS v FROM folders WHERE path = ?").get(folder) as { v: string | null } | undefined;
    return r?.v ?? null;
  }

  setUidValidity(folder: string, value: string): void {
    this.db.prepare("UPDATE folders SET uid_validity = ? WHERE path = ?").run(value, folder);
  }

  // ---- 메일 ----

  localUids(folder: string): number[] {
    return (this.db.prepare("SELECT uid FROM messages WHERE folder = ?").all(folder) as { uid: number }[]).map((r) => r.uid);
  }

  insertMessages(list: NewMessage[]): void {
    const ins = this.db.prepare(
      `INSERT OR IGNORE INTO messages (folder, uid, subject, from_name, from_addr, to_text, date, seen, flagged, has_attachments)
       VALUES (@folder, @uid, @subject, @fromName, @fromAddr, @toText, @date, @seen, @flagged, @hasAttachments)`,
    );
    this.db.transaction((rows: NewMessage[]) => {
      for (const m of rows) ins.run({ ...m, seen: m.seen ? 1 : 0, flagged: m.flagged ? 1 : 0, hasAttachments: m.hasAttachments ? 1 : 0 });
    })(list);
  }

  updateFlags(folder: string, flags: { uid: number; seen: boolean; flagged: boolean }[]): void {
    const upd = this.db.prepare("UPDATE messages SET seen = ?, flagged = ? WHERE folder = ? AND uid = ?");
    this.db.transaction((rows: typeof flags) => {
      for (const f of rows) upd.run(f.seen ? 1 : 0, f.flagged ? 1 : 0, folder, f.uid);
    })(flags);
  }

  setSeen(id: number, seen: boolean): void {
    this.db.prepare("UPDATE messages SET seen = ? WHERE id = ?").run(seen ? 1 : 0, id);
  }

  deleteUids(folder: string, uids: number[]): void {
    const del = this.db.prepare("DELETE FROM messages WHERE folder = ? AND uid = ?");
    this.db.transaction((list: number[]) => {
      for (const u of list) del.run(folder, u);
    })(uids);
  }

  clearFolder(folder: string): void {
    this.db.prepare("DELETE FROM messages WHERE folder = ?").run(folder);
  }

  /** 폴더(또는 전체메일 "*")와 조건(안 읽음·별표·첨부·검색어)에 맞는 WHERE 절 */
  private where(folder: string, filter: MailFilter = {}): { sql: string; args: (string | number)[] } {
    const parts: string[] = [];
    const args: (string | number)[] = [];
    if (folder !== ALL_MAIL_FOLDER) {
      parts.push("folder = ?");
      args.push(folder);
    } else {
      // 전체메일: 휴지통과 스팸은 제외한다
      parts.push("folder NOT IN (SELECT path FROM folders WHERE special_use IN (?, ?))");
      args.push("\\Trash", "\\Junk");
    }
    if (filter.unread) parts.push("seen = 0");
    if (filter.flagged) parts.push("flagged = 1");
    if (filter.attachment) parts.push("has_attachments = 1");
    if (filter.ids) {
      const ids = filter.ids.filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 5000);
      parts.push(ids.length ? `id IN (${ids.map(() => "?").join(",")})` : "0 = 1"); // 번호가 하나도 없으면 결과도 없다
      args.push(...ids);
    }
    const q = filter.query?.trim().slice(0, 100);
    if (q) {
      // LIKE 의 특수 문자(% _)와 이스케이프 문자(!)는 글자 그대로 찾는다
      const like = `%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`;
      parts.push("(subject LIKE ? ESCAPE '!' OR from_name LIKE ? ESCAPE '!' OR from_addr LIKE ? ESCAPE '!')");
      args.push(like, like, like);
    }
    return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
  }

  list(folder: string, limit: number, offset: number, filter: MailFilter = {}): MailSummary[] {
    const w = this.where(folder, filter);
    const rows = this.db
      .prepare(`SELECT * FROM messages ${w.sql} ORDER BY date DESC, uid DESC LIMIT ? OFFSET ?`)
      .all(...w.args, Math.max(1, Math.min(limit, 500)), Math.max(0, offset)) as MessageRow[];
    return rows.map(toSummary);
  }

  count(folder: string, filter: MailFilter = {}): number {
    const w = this.where(folder, filter);
    return (this.db.prepare(`SELECT COUNT(*) AS c FROM messages ${w.sql}`).get(...w.args) as { c: number }).c;
  }

  /** 번호로 메일의 위치(폴더·서버 번호)와 읽음 여부를 찾는다 */
  locate(ids: number[]): { id: number; folder: string; uid: number; seen: boolean }[] {
    const clean = ids.filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 5000);
    if (clean.length === 0) return [];
    const rows = this.db.prepare(`SELECT id, folder, uid, seen FROM messages WHERE id IN (${clean.map(() => "?").join(",")})`).all(...clean) as { id: number; folder: string; uid: number; seen: number }[];
    return rows.map((r) => ({ ...r, seen: r.seen === 1 }));
  }

  /** 폴더 안의 서버 번호들에 해당하는 로컬 메일 번호 */
  idsByUids(folder: string, uids: number[]): number[] {
    const clean = uids.filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 5000);
    if (clean.length === 0) return [];
    const rows = this.db.prepare(`SELECT id FROM messages WHERE folder = ? AND uid IN (${clean.map(() => "?").join(",")})`).all(folder, ...clean) as { id: number }[];
    return rows.map((r) => r.id);
  }

  setFlagged(id: number, flagged: boolean): void {
    this.db.prepare("UPDATE messages SET flagged = ? WHERE id = ?").run(flagged ? 1 : 0, id);
  }

  unreadTotal(folder: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM messages WHERE folder = ? AND seen = 0").get(folder) as { c: number }).c;
  }

  get(id: number): (MailSummary & { toText: string; body: CachedBody | null }) | null {
    const r = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | undefined;
    if (!r) return null;
    const body: CachedBody | null =
      r.body_text === null && r.body_html === null && r.attachments_json === null
        ? null
        : { text: r.body_text ?? "", html: r.body_html, cc: r.cc_text ?? "", attachments: JSON.parse(r.attachments_json ?? "[]") as MailAttachmentInfo[] };
    return { ...toSummary(r), toText: r.to_text, body };
  }

  setBody(id: number, body: CachedBody): void {
    this.db
      .prepare("UPDATE messages SET body_text = ?, body_html = ?, cc_text = ?, attachments_json = ? WHERE id = ?")
      .run(body.text, body.html, body.cc, JSON.stringify(body.attachments), id);
  }
}
