/** 메일 기능이 화면(웹)과 주고받는 값. 비밀번호는 어디에도 들어 있지 않다(입력할 때만 한 방향으로 전달). */

/** 서버 접속 암호화 방식: ssl = 처음부터 암호화(IMAP 993 / SMTP 465), starttls = 접속 후 암호화로 전환(IMAP 143 / SMTP 587). 없으면 ssl */
export type MailSecurity = "ssl" | "starttls";

export interface MailAccountInfo {
  email: string;
  username: string;
  imapHost: string;
  imapPort: number;
  imapSecurity?: MailSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity?: MailSecurity;
  /** 보낸 메일을 보낸메일함에 이 앱이 직접 저장할지 (서버가 보낸 메일을 자동으로 저장하지 않을 때만 켠다) */
  saveToSent: boolean;
  /** 서버에서 최근 며칠 안의 메일을 받을지. 0 이면 전부. 없으면 90일 */
  syncDays?: number;
}

/** 동기화 기간으로 고를 수 있는 값 (일). 0 = 전체 */
export const SYNC_DAYS_CHOICES = [90, 365, 1095, 0] as const;

/** 계정 저장 요청: 비밀번호는 저장 즉시 암호화되어 이 PC 에만 남는다 */
export interface MailAccountInput extends Omit<MailAccountInfo, "username" | "saveToSent" | "syncDays"> {
  username?: string;
  saveToSent?: boolean;
  syncDays?: number;
  password: string;
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
  date: number; // epoch ms
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
  /** 안전하게 정리된 HTML (스크립트·원격 리소스 제거). 없으면 null */
  html: string | null;
  /** 원격 이미지를 막았는가 ("이미지 보기"로 허용할 수 있다) */
  remoteImagesBlocked: boolean;
  attachments: MailAttachmentInfo[];
}

/** 새로 도착한 메일 한 통의 알림용 정보 */
export interface NewMailInfo {
  id: number;
  from: string;
  subject: string;
}

/** 모든 폴더의 메일을 한꺼번에 보는 가상 폴더("전체메일") */
export const ALL_MAIL_FOLDER = "*";

/** 목록 조건: 안 읽음·별표·첨부 있음, 제목/보낸 사람 검색어 */
export interface MailFilter {
  unread?: boolean;
  flagged?: boolean;
  attachment?: boolean;
  query?: string;
  /** 이 번호의 메일만 (서버 본문 검색 결과로 목록을 좁힐 때) */
  ids?: number[];
}

export type MailResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const DAUM_DEFAULTS = { imapHost: "imap.daum.net", imapPort: 993, smtpHost: "smtp.daum.net", smtpPort: 465 } as const;

/** 주소록(받는 사람 자동완성) 한 건 */
export interface MailContact {
  name: string;
  address: string;
}

/** 주소록 화면의 한 건 */
export interface AddressBookEntry extends MailContact {
  memo: string;
  /** 직접 추가하거나 고친 연락처인가 (아니면 보낸 메일에서 자동으로 올라온 것) */
  manual: boolean;
  lastUsed: number;
}
