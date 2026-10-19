/**
 * IMAP 동기화 (main 프로세스 전용). 작업마다 접속해서 하고 끊는다(연결 유지 없음).
 * 서버(다음스마트워크)는 IDLE 을 지원하지 않으므로 새 메일 확인은 나중 단계에서 주기적으로 이 동기화를 부르는 방식이다.
 *
 * 폴더 동기화:
 *  - UIDVALIDITY 가 바뀌면 그 폴더의 로컬 사본을 모두 버리고 다시 받는다 (UID 의 의미가 바뀐 것)
 *  - 최근 N일(기본 90일) 안의 메일 중 로컬에 없는 것만 헤더를 내려받는다
 *  - 서버에서 지워진 메일(전체 UID 목록에 없는 것)은 로컬에서도 지운다. 기간 밖으로 밀려난 오래된 메일은 지우지 않는다.
 *  - 읽음/별표 표시는 서버 값으로 갱신한다
 */
import { ImapFlow, type FetchMessageObject, type ImapFlowOptions, type ListResponse } from "imapflow";

import { type Logger, silentLogger } from "../log";
import type { MailCredentials } from "./account";
import type { FolderRecord, MailStore, NewMessage } from "./store";

export const DEFAULT_WINDOW_DAYS = 90;
const FETCH_CHUNK = 200;

export interface SyncDeps {
  store: MailStore;
  credentials: () => MailCredentials | null;
  log?: Logger;
  windowDays?: number;
  now?: () => number;
  /** 테스트에서만 쓴다 (가짜 서버는 암호화가 없다). 운영에서는 비워 둔다 */
  connectOverrides?: Partial<ImapFlowOptions>;
}

export class MailError extends Error {
  constructor(message: string, readonly kind: "auth" | "network" | "tls" | "config" | "recipient" | "sender" | "size" | "other" = "other") {
    super(message);
  }
}

/** 접속 오류를 사용자가 이해할 수 있는 문구로 바꾼다. 서버 응답 원문이나 비밀번호는 담지 않는다. */
export function describeImapError(err: unknown): MailError {
  const e = err as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string };
  if (e?.authenticationFailed) {
    return new MailError("로그인에 실패했습니다. 이메일·비밀번호를 확인하세요. (다음스마트워크 설정에서 외부 프로그램(IMAP/SMTP) 사용이 꺼져 있거나, 2단계 인증을 쓰면 앱 비밀번호가 필요할 수 있습니다.)", "auth");
  }
  const code = e?.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new MailError("메일 서버 주소를 찾을 수 없습니다. 서버 주소와 인터넷 연결을 확인하세요.", "network");
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "NoConnection" || code === "ETIMEOUT") {
    return new MailError("메일 서버에 연결할 수 없습니다. 포트 번호와 방화벽, 인터넷 연결을 확인하세요.", "network");
  }
  if (/CERT|SSL|TLS|self.signed|unable to verify/i.test(code) || /certificate|SSL|TLS/i.test(e?.message ?? "")) {
    return new MailError("메일 서버의 보안 인증서를 확인할 수 없어 연결을 막았습니다. 서버 주소를 확인하세요.", "tls");
  }
  return new MailError("메일 서버와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.", "other");
}

export class MailSync {
  private readonly log: Logger;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: SyncDeps) {
    this.log = deps.log ?? silentLogger;
  }

  /** 같은 계정에 동시에 여러 번 접속하지 않도록 작업을 한 줄로 세운다 */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private newClient(creds: MailCredentials): ImapFlow {
    return new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort,
      secure: true, // 993 은 암호화로 바로 접속한다
      auth: { user: creds.username, pass: creds.password },
      logger: false,
      socketTimeout: 60_000,
      greetingTimeout: 15_000,
      connectionTimeout: 15_000,
      ...this.deps.connectOverrides,
    });
  }

  private async withClient<T>(job: (client: ImapFlow) => Promise<T>, credsOverride?: MailCredentials): Promise<T> {
    const creds = credsOverride ?? this.deps.credentials();
    if (!creds) throw new MailError("메일 계정이 등록되어 있지 않습니다.", "config");
    const client = this.newClient(creds);
    client.on("error", (e: Error) => this.log.warn(`[Mail] IMAP 연결 오류 이벤트: ${(e as { code?: string }).code ?? e.name}`));
    try {
      await client.connect();
      return await job(client);
    } catch (err) {
      if (err instanceof MailError) throw err;
      const mapped = describeImapError(err);
      this.log.warn(`[Mail] IMAP 작업 실패: ${mapped.kind} (${(err as { code?: string }).code ?? (err as Error).name})`);
      throw mapped;
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }

  /** 계정 등록 전 접속 확인: 로그인하고 폴더 목록을 읽을 수 있는지만 본다 */
  testConnection(creds: MailCredentials): Promise<{ folders: number }> {
    return this.serial(() =>
      this.withClient(async (client) => {
        const list = await client.list();
        this.log.info(`[Mail] 접속 테스트 성공: ${creds.imapHost} (폴더 ${list.length}개)`);
        return { folders: list.length };
      }, creds),
    );
  }

  syncFolders(): Promise<FolderRecord[]> {
    return this.serial(() => this.withClient((client) => this.doSyncFolders(client)));
  }

  private async doSyncFolders(client: ImapFlow): Promise<FolderRecord[]> {
    const list: ListResponse[] = await client.list();
    const folders: FolderRecord[] = list
      .filter((f) => !f.flags.has("\\Noselect") && !f.flags.has("\\NonExistent"))
      .map((f) => ({
        path: f.path,
        name: f.name,
        specialUse: f.specialUse ?? (f.path.toUpperCase() === "INBOX" ? "\\Inbox" : null),
        uidValidity: this.deps.store.uidValidity(f.path),
      }));
    this.deps.store.replaceFolders(folders);
    this.log.debug(`[Mail] 폴더 목록 동기화: ${folders.length}개`);
    return folders;
  }

  /** 폴더 목록과 지정한 폴더(기본 INBOX)의 메일을 맞춘다 */
  async syncFolder(folderPath: string): Promise<{ added: number; removed: number }> {
    const { added, removed } = await this.syncFolderDetailed(folderPath);
    return { added, removed };
  }

  /** syncFolder 와 같지만 이번에 새로 받은 메일의 UID 목록도 알려 준다 (새 메일 알림용) */
  syncFolderDetailed(folderPath: string): Promise<{ added: number; removed: number; addedUids: number[] }> {
    return this.serial(() =>
      this.withClient(async (client) => {
        await this.doSyncFolders(client);
        if (!this.deps.store.hasFolder(folderPath)) throw new MailError("해당 폴더를 찾을 수 없습니다.", "config");
        return this.doSyncMessages(client, folderPath);
      }),
    );
  }

  /** 전체메일용: 휴지통·스팸을 뺀 모든 폴더를 한 번의 접속으로 맞춘다. 폴더 하나가 실패해도 나머지는 계속한다 */
  syncAll(): Promise<{ added: number; removed: number }> {
    return this.serial(() =>
      this.withClient(async (client) => {
        const folders = await this.doSyncFolders(client);
        const total = { added: 0, removed: 0 };
        let lastError: unknown = null;
        let succeeded = 0;
        for (const f of folders) {
          if (f.specialUse === "\\Trash" || f.specialUse === "\\Junk") continue;
          try {
            const r = await this.doSyncMessages(client, f.path);
            total.added += r.added;
            total.removed += r.removed;
            succeeded++;
          } catch (err) {
            lastError = err;
            this.log.warn(`[Mail] 폴더 동기화 실패(건너뜀): ${f.path}`);
          }
        }
        if (succeeded === 0 && lastError) throw lastError;
        return total;
      }),
    );
  }

  private async doSyncMessages(client: ImapFlow, folderPath: string): Promise<{ added: number; removed: number; addedUids: number[] }> {
    const store = this.deps.store;
    const now = this.deps.now?.() ?? Date.now();
    const days = this.deps.windowDays ?? DEFAULT_WINDOW_DAYS;
    const since = new Date(now - days * 86_400_000);

    const lock = await client.getMailboxLock(folderPath, { readOnly: true });
    try {
      const mailbox = client.mailbox;
      const validity = mailbox && typeof mailbox === "object" ? String(mailbox.uidValidity) : "";
      const known = store.uidValidity(folderPath);
      if (known !== null && validity && known !== validity) {
        this.log.info(`[Mail] UIDVALIDITY 변경: ${folderPath} — 로컬 사본을 버리고 다시 받습니다`);
        store.clearFolder(folderPath);
      }
      if (validity) store.setUidValidity(folderPath, validity);

      const allUids = ((await client.search({ all: true }, { uid: true })) || []) as number[];
      const sinceUids = ((await client.search({ since }, { uid: true })) || []) as number[];
      const local = new Set(store.localUids(folderPath));
      const serverSet = new Set(allUids);

      const removed = [...local].filter((u) => !serverSet.has(u));
      if (removed.length) store.deleteUids(folderPath, removed);

      const toFetch = sinceUids.filter((u) => !local.has(u));
      let added = 0;
      const addedUids: number[] = [];
      for (let i = 0; i < toFetch.length; i += FETCH_CHUNK) {
        const chunk = toFetch.slice(i, i + FETCH_CHUNK);
        const rows: NewMessage[] = [];
        for await (const msg of client.fetch(chunk.join(","), { uid: true, flags: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) {
          rows.push(toNewMessage(folderPath, msg));
        }
        store.insertMessages(rows);
        added += rows.length;
        addedUids.push(...rows.map((r) => r.uid));
      }

      // 이미 받아 둔 메일의 읽음/별표 표시를 서버 값으로 맞춘다
      const refresh = sinceUids.filter((u) => local.has(u));
      for (let i = 0; i < refresh.length; i += FETCH_CHUNK) {
        const chunk = refresh.slice(i, i + FETCH_CHUNK);
        const flags: { uid: number; seen: boolean; flagged: boolean }[] = [];
        for await (const msg of client.fetch(chunk.join(","), { uid: true, flags: true }, { uid: true })) {
          flags.push({ uid: msg.uid, seen: msg.flags?.has("\\Seen") ?? false, flagged: msg.flags?.has("\\Flagged") ?? false });
        }
        store.updateFlags(folderPath, flags);
      }
      this.log.info(`[Mail] 동기화 완료: ${folderPath} (새 ${added}건, 서버에서 삭제된 ${removed.length}건)`);
      return { added, removed: removed.length, addedUids };
    } finally {
      lock.release();
    }
  }

  /** 메일 원문(헤더+본문+첨부)을 내려받는다 */
  fetchSource(folderPath: string, uid: number): Promise<Buffer> {
    return this.serial(() =>
      this.withClient(async (client) => {
        const lock = await client.getMailboxLock(folderPath, { readOnly: true });
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) throw new MailError("서버에서 메일을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.", "other");
          return msg.source;
        } finally {
          lock.release();
        }
      }),
    );
  }

  /** 서버의 읽음 표시를 바꾼다 */
  setSeenOnServer(folderPath: string, uid: number, seen: boolean): Promise<void> {
    return this.setFlagOnServer(folderPath, uid, "\\Seen", seen);
  }

  /**
   * 보낸 메일을 서버의 보낸메일함에 저장한다(읽음 표시로). 보낸메일함 폴더를 찾지 못하면 저장하지 않고 false 를 돌려준다.
   * 서버가 SMTP 로 보낸 메일을 자동으로 저장하는 경우에는 중복 저장이 되므로, 계정 설정의 "보낸 메일 저장"을 켠 때만 쓴다.
   */
  appendToSent(raw: Buffer): Promise<boolean> {
    return this.serial(() =>
      this.withClient(async (client) => {
        const folders = await this.doSyncFolders(client);
        const sent = findSentFolder(folders);
        if (!sent) {
          this.log.warn("[Mail] 보낸메일함 폴더를 찾지 못해 보낸 메일을 저장하지 못했습니다");
          return false;
        }
        await client.append(sent.path, raw, ["\\Seen"], new Date());
        this.log.info(`[Mail] 보낸 메일을 ${sent.path} 에 저장`);
        return true;
      }),
    );
  }

  /** 메일을 다른 폴더로 옮긴다 (서버의 MOVE 를 쓴다). 옮긴 메일은 서버에서 새 번호를 받으므로 도착 폴더는 다음 동기화 때 들어온다 */
  moveMessages(folderPath: string, uids: number[], destPath: string): Promise<void> {
    if (uids.length === 0) return Promise.resolve();
    return this.serial(() =>
      this.withClient(async (client) => {
        const lock = await client.getMailboxLock(folderPath);
        try {
          await client.messageMove(uids.join(","), destPath, { uid: true });
          this.log.info(`[Mail] 메일 ${uids.length}통 이동: ${folderPath} → ${destPath}`);
        } finally {
          lock.release();
        }
      }),
    );
  }

  /** 메일을 서버에서 완전히 지운다 (\Deleted 표시 후 정리). 되돌릴 수 없으므로 휴지통·스팸함에서만 쓴다 */
  deleteMessages(folderPath: string, uids: number[]): Promise<void> {
    if (uids.length === 0) return Promise.resolve();
    return this.serial(() =>
      this.withClient(async (client) => {
        const lock = await client.getMailboxLock(folderPath);
        try {
          await client.messageDelete(uids.join(","), { uid: true });
          this.log.info(`[Mail] 메일 ${uids.length}통 완전 삭제: ${folderPath}`);
        } finally {
          lock.release();
        }
      }),
    );
  }

  /** 서버에서 본문까지 검색한다 (IMAP SEARCH BODY). 이 PC 에 받아 두지 않은 본문도 서버가 찾아 준다 */
  searchBody(folderPath: string, query: string): Promise<number[]> {
    return this.serial(() =>
      this.withClient(async (client) => {
        const lock = await client.getMailboxLock(folderPath, { readOnly: true });
        try {
          const found = await client.search({ or: [{ body: query }, { subject: query }, { from: query }] }, { uid: true });
          return (found || []) as number[];
        } finally {
          lock.release();
        }
      }),
    );
  }

  /** 서버의 별표(중요) 표시를 바꾼다 */
  setFlaggedOnServer(folderPath: string, uid: number, flagged: boolean): Promise<void> {
    return this.setFlagOnServer(folderPath, uid, "\\Flagged", flagged);
  }

  private setFlagOnServer(folderPath: string, uid: number, flag: string, on: boolean): Promise<void> {
    return this.serial(() =>
      this.withClient(async (client) => {
        const lock = await client.getMailboxLock(folderPath);
        try {
          if (on) await client.messageFlagsAdd(String(uid), [flag], { uid: true });
          else await client.messageFlagsRemove(String(uid), [flag], { uid: true });
        } finally {
          lock.release();
        }
      }),
    );
  }
}

const SENT_NAMES = /^(sent|sent items|sent mail|sent messages|보낸\s*메일함|보낸\s*편지함)$/i;

/** 보낸메일함 폴더: 서버가 용도(\Sent)를 알려 주면 그것, 아니면 이름으로 짐작한다 */
export function findSentFolder<T extends { path: string; name: string; specialUse: string | null }>(folders: T[]): T | undefined {
  return folders.find((f) => f.specialUse === "\\Sent") ?? folders.find((f) => SENT_NAMES.test(f.name.trim()));
}

const TRASH_NAMES = /^(trash|deleted items|deleted messages|bin|휴지통)$/i;
const JUNK_NAMES = /^(spam|junk|junk e-?mail|junk mail|bulk mail|스팸\s*메일함|스팸\s*편지함|스팸)$/i;

type FolderLike = { path: string; name: string; specialUse: string | null };

/** 휴지통 폴더: 서버가 용도(\Trash)를 알려 주면 그것, 아니면 이름으로 짐작한다 */
export function findTrashFolder<T extends FolderLike>(folders: T[]): T | undefined {
  return folders.find((f) => f.specialUse === "\\Trash") ?? folders.find((f) => TRASH_NAMES.test(f.name.trim()));
}

/** 스팸 폴더 */
export function findJunkFolder<T extends FolderLike>(folders: T[]): T | undefined {
  return folders.find((f) => f.specialUse === "\\Junk") ?? folders.find((f) => JUNK_NAMES.test(f.name.trim()));
}

function hasAttachment(node: unknown): boolean {
  const n = node as { disposition?: string; childNodes?: unknown[]; parameters?: Record<string, string>; dispositionParameters?: Record<string, string> } | undefined;
  if (!n) return false;
  if (n.disposition === "attachment") return true;
  return (n.childNodes ?? []).some(hasAttachment);
}

function toNewMessage(folder: string, msg: FetchMessageObject): NewMessage {
  const env = msg.envelope;
  const from = env?.from?.[0];
  const to = (env?.to ?? []).map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? ""))).filter(Boolean);
  const raw = env?.date ?? msg.internalDate;
  const dateMs = raw instanceof Date ? raw.getTime() : raw ? new Date(raw).getTime() : Number.NaN;
  return {
    folder,
    uid: msg.uid,
    subject: env?.subject ?? "",
    fromName: from?.name ?? "",
    fromAddr: from?.address ?? "",
    toText: to.join(", "),
    date: Number.isFinite(dateMs) ? dateMs : Date.now(),
    seen: msg.flags?.has("\\Seen") ?? false,
    flagged: msg.flags?.has("\\Flagged") ?? false,
    hasAttachments: hasAttachment(msg.bodyStructure),
  };
}
