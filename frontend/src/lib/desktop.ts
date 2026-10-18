// 데스크톱 앱(Electron)에서 열렸을 때만 있는 기능. 앱이 화면에 노출한 window.benchClient 의 모양.
// 브라우저로 접속하면 benchClient 가 없으므로 항상 getBenchClient() 로 확인하고 쓴다.

export type NfcReaderState = "searching" | "connecting" | "ready" | "busy" | "error";

export interface NfcReaderStatus {
  state: NfcReaderState;
  port?: string;
  firmware?: string;
  message?: string;
}

/** 앱이 카드로 로그인을 요청한 결과. 카드 번호는 오지 않는다. */
export type NfcLoginResult = { ok: true; token: string } | { ok: false; error: string };

/** 카드가 닿았을 때 앱이 할 일: off(기본) / login(로그인 화면, 앱이 서버에 로그인 요청) / capture(카드 등록 중, 번호를 화면에 전달) */
export type NfcMode = "off" | "login" | "capture";

export type DeviceApprovalStatus = "pending" | "approved" | "revoked" | "unknown";

/** 메일 (앱 전용). 계정 비밀번호는 saveAccount 로 한 번 보내기만 하고 돌려받지 않는다 */
export interface MailAccountInfo {
  email: string;
  username: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export interface MailAccountInput {
  email: string;
  username?: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export interface MailFolder {
  path: string;
  name: string;
  specialUse: string | null;
  unread: number;
  total: number;
}

export interface MailSummary {
  id: number;
  folder: string;
  uid: number;
  subject: string;
  fromName: string;
  fromAddr: string;
  date: number;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}

export interface MailAttachmentInfo {
  index: number;
  filename: string;
  contentType: string;
  size: number;
}

export interface MailDetail extends MailSummary {
  to: string;
  cc: string;
  text: string;
  /** 앱이 안전하게 정리한 HTML. 없으면 null */
  html: string | null;
  remoteImagesBlocked: boolean;
  attachments: MailAttachmentInfo[];
}

/** 목록 조건: 안 읽음·중요(별표)·첨부 있음, 제목/보낸 사람 검색어 */
export interface MailFilter {
  unread?: boolean;
  flagged?: boolean;
  attachment?: boolean;
  query?: string;
}

/** 모든 폴더의 메일을 한꺼번에 보는 가상 폴더("전체메일") */
export const ALL_MAIL_FOLDER = "*";

export type MailResult<T> = { ok: true; value: T } | { ok: false; error: string; canceled?: boolean };

export interface MailBridge {
  /** 메일을 별도 창으로 연다 (이미 열려 있으면 그 창을 앞으로) */
  openWindow(): Promise<void>;
  account(): Promise<MailAccountInfo | null>;
  saveAccount(input: MailAccountInput): Promise<MailResult<MailAccountInfo>>;
  removeAccount(): Promise<void>;
  folders(): Promise<MailFolder[]>;
  sync(folder: string): Promise<MailResult<{ added: number; removed: number }>>;
  list(folder: string, offset: number, limit: number, filter?: MailFilter): Promise<{ items: MailSummary[]; total: number }>;
  get(id: number, allowRemoteImages: boolean): Promise<MailResult<MailDetail>>;
  markSeen(id: number, seen: boolean): Promise<void>;
  setFlagged(id: number, flagged: boolean): Promise<void>;
  saveAttachment(id: number, index: number): Promise<MailResult<{ filename: string }>>;
  openAttachment(id: number, index: number): Promise<MailResult<{ filename: string }>>;
}

export interface BenchClient {
  /** 앱 버전 (화면 표기 V.0.07.150) */
  getVersion(): Promise<string>;
  nfc: {
    status(): Promise<NfcReaderStatus | null>;
    onStatus(cb: (status: NfcReaderStatus) => void): () => void;
    setMode(mode: NfcMode): Promise<void>;
    /** capture 모드에서 카드가 리더에 닿을 때 호출된다. uid 는 대문자 16진수 */
    onCard(cb: (card: { uid: string }) => void): () => void;
    /** login 모드에서 카드로 로그인한 결과 */
    onLogin(cb: (result: NfcLoginResult) => void): () => void;
  };
  device: {
    state(): Promise<{ status: DeviceApprovalStatus; error?: string } | null>;
    onStatus(cb: (state: { status: DeviceApprovalStatus; error?: string }) => void): () => void;
  };
  /** 시스템 알림. conversationId 를 주면 알림을 눌렀을 때 onOpenConversation 신호가 온다 */
  notify(title: string, body: string, conversationId?: number): Promise<void>;
  /** 알림을 눌렀을 때 그 대화방을 열라는 신호 */
  onOpenConversation(cb: (payload: { conversationId: number }) => void): () => void;
  setBadge(count: number): Promise<void>;
  /** 메일 기능. 이 기능이 없는 예전 앱 버전에서는 undefined */
  mail?: MailBridge;
}

declare global {
  interface Window {
    benchClient?: BenchClient;
  }
}

export function getBenchClient(): BenchClient | undefined {
  return typeof window === "undefined" ? undefined : window.benchClient;
}

export const NFC_STATE_LABELS: Record<NfcReaderState, string> = {
  ready: "리더 연결됨",
  searching: "리더를 찾는 중",
  connecting: "리더에 연결하는 중",
  busy: "다른 프로그램이 리더를 사용 중",
  error: "리더 오류",
};
