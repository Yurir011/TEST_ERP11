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
  /** 접속 암호화 방식 (ssl: 처음부터 암호화 / starttls: 접속 후 암호화). 없으면 ssl */
  imapSecurity?: "ssl" | "starttls";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity?: "ssl" | "starttls";
  /** 보낸 메일을 보낸메일함에 앱이 직접 저장할지 (서버가 자동 저장하지 않을 때만 켠다) */
  saveToSent: boolean;
  /** 서버에서 최근 며칠 안의 메일을 받을지 (0 이면 전부). 없으면 90일 */
  syncDays?: number;
}

export interface MailAccountInput {
  email: string;
  username?: string;
  saveToSent?: boolean;
  syncDays?: number;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity?: "ssl" | "starttls";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity?: "ssl" | "starttls";
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
  /** 이 번호의 메일만 (서버 본문 검색 결과로 목록을 좁힐 때) */
  ids?: number[];
}

/** 모든 폴더의 메일을 한꺼번에 보는 가상 폴더("전체메일") */
export const ALL_MAIL_FOLDER = "*";

/** 메일 쓰기: 앱이 준비한 첨부 (파일 경로는 화면에 오지 않는다) */
export interface MailStagedAttachment {
  id: string;
  filename: string;
  size: number;
}

export interface MailThreading {
  inReplyTo?: string;
  references?: string[];
}

export type MailDraftKind = "reply" | "replyAll" | "forward" | "self";

export interface MailDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: MailStagedAttachment[];
  threading?: MailThreading;
}

export interface MailSendPayload {
  fromName: string;
  /** 직접 입력한 보내는 사람 주소 (비우면 로그인한 계정 주소) */
  fromAddress?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachmentIds: string[];
  threading?: MailThreading;
}

export interface MailSendResult {
  messageId: string;
  /** 보낸메일함에 저장했는가. 저장 설정이 꺼져 있으면 null */
  savedToSent: boolean | null;
}

export type MailResult<T> = { ok: true; value: T } | { ok: false; error: string; canceled?: boolean };

export interface NewMailItem {
  id: number;
  from: string;
  subject: string;
  /** 어느 메일 계정으로 온 메일인지 (id 는 계정마다 따로 매겨지므로 계정과 함께 써야 한다) */
  accountId?: string;
  /** 계정이 둘 이상일 때만: 그 계정의 이메일 주소 */
  account?: string;
}

/** 등록된 메일 계정 한 개 (계정마다 받은 메일함이 따로 있다) */
export interface MailAccountEntry {
  id: string;
  email: string;
  /** 그 계정 받은메일함의 안 읽은 메일 수 */
  unread: number;
}

export interface MailAccountList {
  accounts: MailAccountEntry[];
  /** 메일 창에서 지금 보는 계정 */
  active: string;
}

export interface MailContact {
  name: string;
  address: string;
}

export interface AddressBookEntry extends MailContact {
  memo: string;
  /** 직접 추가하거나 고친 연락처인가 (아니면 보낸 메일에서 자동으로 올라온 것) */
  manual: boolean;
  lastUsed: number;
}

export interface ContactInput {
  name: string;
  address: string;
  memo: string;
  oldAddress?: string;
}

export interface MailSenderIdentity {
  name: string;
  address: string;
}

export interface MailIdentitySettings {
  items: MailSenderIdentity[];
  /** 기본으로 고를 주소 (빈 문자열이면 로그인한 계정) */
  defaultAddress: string;
}

export interface MailBridge {
  /** 메일을 별도 창으로 연다 (이미 열려 있으면 그 창을 앞으로) */
  openWindow(): Promise<void>;
  /** 새 메일이 도착했을 때 호출된다 (보낸 사람·제목. 이 PC 안에서만 오간다) / 그 메일을 메일 창에서 연다 */
  onNewMail(cb: (items: NewMailItem[]) => void): () => void;
  /** accountId 를 주면 그 계정의 메일을 연다 (없으면 지금 보던 계정) */
  openMessage(id: number, accountId?: string): Promise<void>;
  /** 등록된 메일 계정 목록과 지금 보는 계정 (예전 앱에는 없다) */
  accounts?(): Promise<MailAccountList>;
  /** 메일 창에서 볼 계정을 바꾼다. 이후 목록·본문·쓰기는 그 계정의 메일함에서 이루어진다 */
  useAccount?(id: string): Promise<MailAccountInfo | null>;
  /** 새 계정을 등록할 칸을 준비하고 그 칸으로 바꾼다 (비어 있는 칸이 있으면 그것을 쓴다) */
  newSlot?(): Promise<string | null>;
  /** 등록하지 않고 끝낸 빈 칸을 치운다 */
  dropSlot?(id: string): Promise<void>;
  account(): Promise<MailAccountInfo | null>;
  /** 받는 사람 자동완성: 메일을 보낸 적 있는 주소(최근 순, query 가 있으면 이름·주소에 맞는 것) / 주소록에서 지우기 */
  contacts(query: string, limit?: number): Promise<MailContact[]>;
  removeContact(address: string): Promise<boolean>;
  /** 주소록 화면: 전체 목록(이름순, query 가 있으면 이름·주소·메모에 맞는 것만) / 연락처 추가·수정(oldAddress 가 있으면 수정) */
  addressBook(query: string): Promise<AddressBookEntry[]>;
  saveContact(input: ContactInput): Promise<MailResult<AddressBookEntry>>;
  /** 보내는 사람 목록(쓰기 화면에서 고르는 이름·주소). 이 PC 에만 저장된다 */
  identities(): Promise<MailIdentitySettings>;
  saveIdentities(settings: MailIdentitySettings): Promise<MailResult<MailIdentitySettings>>;
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
  composeDraft(kind: MailDraftKind, id?: number): Promise<MailResult<MailDraft>>;
  pickAttachments(): Promise<MailResult<MailStagedAttachment[]>>;
  discardAttachments(ids: string[]): Promise<void>;
  send(payload: MailSendPayload): Promise<MailResult<MailSendResult>>;
  /** 선택한 메일을 다른 폴더로 옮긴다 */
  move(ids: number[], dest: string): Promise<MailResult<{ moved: number }>>;
  /** 삭제: 기본은 휴지통으로 옮김. permanent=true 는 휴지통(또는 스팸메일함) 안의 메일을 서버에서 완전히 지운다 */
  remove(ids: number[], permanent: boolean): Promise<MailResult<{ trashed: number; deleted: number }>>;
  /** 스팸 신고: 스팸메일함으로 옮긴다 */
  spam(ids: number[]): Promise<MailResult<{ moved: number }>>;
  /** 서버에서 본문·제목·보낸 사람을 찾아, 이 PC 에 받아 둔 메일 중 해당하는 번호를 받는다 */
  searchBody(folder: string, query: string): Promise<MailResult<{ ids: number[] }>>;
  /** 새 메일 확인으로 목록이 바뀌었을 때 호출된다 */
  onChanged(cb: (payload: { accountId?: string }) => void): () => void;
  /** 알림을 눌러 특정 메일을 열라는 신호 (메일 창이 이미 열려 있을 때) */
  onOpenMessage(cb: (payload: { id: number; accountId?: string }) => void): () => void;
  /** 알림을 눌러 메일 창이 새로 열린 경우, 열어야 할 메일 번호를 한 번만 받는다 */
  consumePendingOpen(): Promise<{ accountId: string; id: number } | null>;
  /** ERP 문서(PDF)를 첨부해 메일 창에서 쓰기 화면을 연다. 메일 계정이 없으면 needsAccount */
  composeDocument(payload: MailDocumentPayload): Promise<MailResult<null> & { needsAccount?: boolean }>;
  /** 문서 화면에서 넘어온 쓰기 초안이 도착했다는 신호(메일 창이 이미 열려 있을 때) / 새로 열린 창이 한 번만 가져가는 초안 */
  onOpenCompose(cb: () => void): () => void;
  consumePendingCompose(): Promise<MailPendingCompose | null>;
  /** 이 PC 받은메일함의 안 읽은 수 (계정이 없으면 null) 와 바뀔 때의 신호 */
  unread(): Promise<number | null>;
  onUnread(cb: (payload: { unread: number }) => void): () => void;
}

/** 문서 화면이 메일 쓰기로 넘기는 값. 문서 PDF 는 바이트로 넘기고, 앱이 임시 파일로 만들어 첨부한다 */
export interface MailDocumentPayload {
  to: string;
  subject: string;
  body: string;
  doc: MailDocRef;
  filename: string;
  data: ArrayBuffer;
}

/** 메일이 어느 문서에서 시작됐는지 (보낸 뒤 발송 이력을 서버에 남길 때 쓴다) */
export interface MailDocRef {
  type: "project_document";
  id: number;
}

export interface MailPendingCompose {
  draft: { to: string; cc: string; subject: string; body: string; attachments: MailStagedAttachment[] };
  doc: MailDocRef;
}

export interface UpdateRelease {
  version: string;
  display: string;
  filename: string;
  size: number;
}

export type UpdateCheck = { ok: true; latest: UpdateRelease | null; current: string; newer: boolean } | { ok: false; error: string };

export interface UpdateBridge {
  /** 서버에 더 새 버전이 올라와 있는지 확인한다 */
  check(): Promise<UpdateCheck>;
  /** 새 버전을 받아 설치한다. 성공하면 곧 앱이 종료되고 설치 뒤 다시 시작된다 */
  install(): Promise<MailResult<{ display: string }>>;
  /** 받는 중 진행률 (0~1) */
  onProgress(cb: (payload: { ratio: number }) => void): () => void;
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
  /** ERP 메인 창을 앞으로 가져온다 (메일 창에서 돌아가기). 예전 앱에는 없다 */
  focusMain?(): Promise<void>;
  /** 앱 업데이트 (예전 앱에는 없다) */
  update?: UpdateBridge;
  /** 받은 파일을 이 PC의 기본 프로그램으로 바로 연다 (엑셀·워드·한글 등). 예전 앱에는 없다 */
  openFile?(filename: string, data: ArrayBuffer): Promise<{ ok: boolean; error?: string }>;
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
