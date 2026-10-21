import { ALL_MAIL_FOLDER, type MailFolder, type MailSummary } from "../../lib/desktop";

const SPECIAL_LABELS: Record<string, string> = {
  "\\Inbox": "받은메일함",
  "\\Drafts": "임시보관함",
  "\\Sent": "보낸메일함",
  "\\Trash": "휴지통",
  "\\Junk": "스팸메일함",
  "\\Archive": "보관함",
};

/** 폴더 이름을 화면에 보일 한글 이름으로 바꾼다 (서버가 용도를 알려 주지 않으면 이름으로 짐작한다) */
export function folderLabel(folder: Pick<MailFolder, "path" | "name" | "specialUse">): string {
  if (folder.path === ALL_MAIL_FOLDER) return "전체메일";
  if (folder.path.toUpperCase() === "INBOX") return SPECIAL_LABELS["\\Inbox"];
  if (folder.specialUse && SPECIAL_LABELS[folder.specialUse]) return SPECIAL_LABELS[folder.specialUse];
  return folder.name;
}

/** "내게쓴메일함"(자기 자신에게 보낸 메일 보관함) 폴더인가 */
export function isSelfMailFolder(folder: Pick<MailFolder, "name">): boolean {
  return folder.name.replace(/\s/g, "") === "내게쓴메일함";
}

function folderRank(f: MailFolder): number {
  if (f.path.toUpperCase() === "INBOX") return 1;
  if (isSelfMailFolder(f)) return 2;
  const order: Record<string, number> = { "\\Sent": 3, "\\Drafts": 4, "\\Archive": 5, "\\Junk": 20, "\\Trash": 21 };
  return (f.specialUse && order[f.specialUse]) || 10;
}

/** 받은메일함 → 내게쓴 → 보낸 → 임시보관 → 보관 → 사용자 폴더(이름순) → 스팸 → 휴지통 */
export function sortFolders(folders: MailFolder[]): MailFolder[] {
  return [...folders].sort((a, b) => {
    const ra = folderRank(a);
    const rb = folderRank(b);
    if (ra !== rb) return ra - rb;
    return folderLabel(a).localeCompare(folderLabel(b), "ko");
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 오늘이면 시:분, 올해면 월/일, 그 외는 연.월.일 */
export function formatMailDate(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 상세 화면용 전체 날짜 */
export function formatMailDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function senderLabel(m: Pick<MailSummary, "fromName" | "fromAddr">): string {
  return m.fromName || m.fromAddr || "(보낸 사람 없음)";
}

export function subjectLabel(m: Pick<MailSummary, "subject">): string {
  return m.subject.trim() || "(제목 없음)";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 쪽 번호 목록: 현재 쪽 주위로 최대 10개를 보여 준다 (예: 전체 25쪽에서 13쪽이면 8~17) */
export function pageNumbers(current: number, totalPages: number, span = 10): number[] {
  if (totalPages <= 0) return [];
  const size = Math.min(span, totalPages);
  let start = Math.max(1, current - Math.floor(size / 2));
  if (start + size - 1 > totalPages) start = totalPages - size + 1;
  return Array.from({ length: size }, (_, i) => start + i);
}

/** 접속 암호화 방식: ssl = 처음부터 암호화(IMAP 993 / SMTP 465), starttls = 접속 후 암호화로 전환(IMAP 143 / SMTP 587) */
export type MailSecurity = "ssl" | "starttls";

/** 메일 서비스별 접속 정보 (계정 등록 화면에서 서비스를 고르면 서버 주소·포트·암호화 방식이 채워진다) */
export interface MailProvider {
  id: string;
  label: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: MailSecurity;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: MailSecurity;
  /** 보낸 메일을 앱이 보낸메일함에 직접 저장할지의 권장값 (서버가 보낸 메일을 자동으로 보관하면 꺼 둔다) */
  saveToSent: boolean;
  /** 로그인 아이디가 이메일 앞부분(@ 앞)뿐인 서비스 */
  usernameIsLocalPart?: boolean;
  /** 이 서비스에서 계정을 쓰기 전에 해 둘 일 */
  hint: string;
}

export const CUSTOM_PROVIDER_ID = "custom";

export const MAIL_PROVIDERS: MailProvider[] = [
  {
    id: "daum-smartwork",
    label: "다음 스마트워크",
    imapHost: "imap.daum.net", imapPort: "993", imapSecurity: "ssl",
    smtpHost: "smtp.daum.net", smtpPort: "465", smtpSecurity: "ssl",
    saveToSent: false,
    hint: "회사 메일 주소 전체로 로그인합니다. 다음 스마트워크 메일 설정에서 외부 프로그램(IMAP/SMTP) 사용이 켜져 있어야 합니다.",
  },
  {
    id: "daum",
    label: "다음 (한메일)",
    imapHost: "imap.daum.net", imapPort: "993", imapSecurity: "ssl",
    smtpHost: "smtp.daum.net", smtpPort: "465", smtpSecurity: "ssl",
    saveToSent: false,
    hint: "다음 메일 환경설정의 IMAP/SMTP 설정에서 IMAP 사용을 켜 주세요. 이메일 주소(@daum.net, @hanmail.net)로 로그인합니다.",
  },
  {
    id: "gmail",
    label: "지메일 (Gmail)",
    imapHost: "imap.gmail.com", imapPort: "993", imapSecurity: "ssl",
    smtpHost: "smtp.gmail.com", smtpPort: "465", smtpSecurity: "ssl",
    saveToSent: false,
    hint: "구글 계정에서 2단계 인증을 켠 뒤 '앱 비밀번호'를 만들어 아래 비밀번호에 입력하세요. 일반 비밀번호로는 로그인되지 않습니다. 지메일은 보낸 메일을 자동으로 보관합니다.",
  },
  {
    id: "naver",
    label: "네이버",
    imapHost: "imap.naver.com", imapPort: "993", imapSecurity: "ssl",
    smtpHost: "smtp.naver.com", smtpPort: "465", smtpSecurity: "ssl",
    saveToSent: false,
    usernameIsLocalPart: true,
    hint: "네이버 메일 환경설정 > POP3/IMAP 설정에서 IMAP/SMTP 사용을 켜 주세요. 2단계 인증을 쓰면 '애플리케이션 비밀번호'를 만들어 입력합니다. 로그인 아이디는 @naver.com 앞부분입니다.",
  },
  {
    id: "outlook",
    label: "아웃룩 (Outlook·Microsoft 365)",
    imapHost: "outlook.office365.com", imapPort: "993", imapSecurity: "ssl",
    smtpHost: "smtp.office365.com", smtpPort: "587", smtpSecurity: "starttls",
    saveToSent: false,
    hint: "계정(또는 회사 관리자)이 IMAP 사용을 허용해야 합니다. 2단계 인증을 쓰면 앱 비밀번호가 필요할 수 있습니다.",
  },
];

/** 예전 코드와의 호환: 처음 기본값이던 다음 스마트워크 */
export const DAUM_DEFAULTS = MAIL_PROVIDERS[0];

/** 저장된 서버 설정과 같은 서비스를 찾는다 (없으면 직접 입력) */
export function detectProvider(info: { imapHost: string; smtpHost: string } | null | undefined): string {
  if (!info) return MAIL_PROVIDERS[0].id;
  return MAIL_PROVIDERS.find((p) => p.imapHost === info.imapHost && p.smtpHost === info.smtpHost)?.id ?? CUSTOM_PROVIDER_ID;
}

/** 암호화 방식을 바꿀 때 어울리는 표준 포트 */
export const STANDARD_PORTS = { imap: { ssl: "993", starttls: "143" }, smtp: { ssl: "465", starttls: "587" } } as const;

/** 한 쪽에 보여 줄 메일 수 선택지와 기본값 */
export const PAGE_SIZES = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** 한 번에 보낼 첨부 파일 크기의 합 한도 (앱의 한도와 같은 값) */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const TRASH_NAMES = /^(trash|deleted items|deleted messages|bin|휴지통)$/i;
const JUNK_NAMES = /^(spam|junk|junk e-?mail|junk mail|bulk mail|스팸\s*메일함|스팸\s*편지함|스팸)$/i;

/** 휴지통 폴더인가 (앱과 같은 기준: 서버가 알려 준 용도, 없으면 이름) */
export function isTrashFolder(f: Pick<MailFolder, "name" | "specialUse"> | undefined): boolean {
  return !!f && (f.specialUse === "\\Trash" || TRASH_NAMES.test(f.name.trim()));
}

/** 스팸메일함 폴더인가 */
export function isJunkFolder(f: Pick<MailFolder, "name" | "specialUse"> | undefined): boolean {
  return !!f && (f.specialUse === "\\Junk" || JUNK_NAMES.test(f.name.trim()));
}
