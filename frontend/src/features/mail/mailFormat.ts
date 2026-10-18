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

/** 다음스마트워크 접속 정보 (IMAP 993/SSL, SMTP 465/SSL, 비밀번호 방식) */
export const DAUM_DEFAULTS = { imapHost: "imap.daum.net", imapPort: "993", smtpHost: "smtp.daum.net", smtpPort: "465" } as const;

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
