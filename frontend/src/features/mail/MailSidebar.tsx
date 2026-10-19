import { BookUser, FileEdit, Folder, Inbox, Layers, Paperclip, Send, SquarePen, Star, Mail as MailIcon, Settings, Trash2, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ALL_MAIL_FOLDER, type MailFilter, type MailFolder } from "../../lib/desktop";
import { folderLabel, isSelfMailFolder, sortFolders } from "./mailFormat";

interface Props {
  userName: string;
  email: string;
  folders: MailFolder[];
  folder: string;
  onSelectFolder: (path: string) => void;
  filter: Pick<MailFilter, "unread" | "flagged" | "attachment">;
  onToggleFilter: (key: "unread" | "flagged" | "attachment") => void;
  onSettings: () => void;
  onCompose: () => void;
  onComposeSelf: () => void;
  onAddressBook: () => void;
  /** 주소록 화면을 보고 있는가 */
  bookActive: boolean;
}

function folderIcon(f: MailFolder): ReactNode {
  if (f.path === ALL_MAIL_FOLDER) return <Layers size={17} />;
  if (f.path.toUpperCase() === "INBOX") return <Inbox size={17} />;
  if (isSelfMailFolder(f)) return <SquarePen size={17} />;
  switch (f.specialUse) {
    case "\\Sent":
      return <Send size={17} />;
    case "\\Drafts":
      return <FileEdit size={17} />;
    case "\\Trash":
      return <Trash2 size={17} />;
    case "\\Junk":
      return <ShieldAlert size={17} />;
    default:
      return <Folder size={17} />;
  }
}

const QUICK: { key: "unread" | "flagged" | "attachment"; label: string; icon: ReactNode }[] = [
  { key: "unread", label: "안읽음", icon: <MailIcon size={20} /> },
  { key: "flagged", label: "중요", icon: <Star size={20} /> },
  { key: "attachment", label: "첨부", icon: <Paperclip size={20} /> },
];

/** 왼쪽 패널: 내 정보, 빠른 조건(안읽음·중요·첨부), 메일쓰기, 폴더 목록 */
export function MailSidebar({ userName, email, folders, folder, onSelectFolder, filter, onToggleFilter, onSettings, onCompose, onComposeSelf, onAddressBook, bookActive }: Props) {
  const all: MailFolder = { path: ALL_MAIL_FOLDER, name: "전체메일", specialUse: null, unread: 0, total: 0 };
  const sorted = sortFolders(folders.length ? folders : [{ path: "INBOX", name: "INBOX", specialUse: "\\Inbox", unread: 0, total: 0 }]);
  const list = [all, ...sorted];

  return (
    <aside className="w-72 shrink-0 bg-surface border-r border-border flex flex-col h-full" aria-label="메일 메뉴">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-semibold shrink-0" aria-hidden="true">
          {userName.slice(0, 1) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{userName}</p>
          <p className="text-xs text-text-muted truncate" title={email}>{email}</p>
        </div>
        <button type="button" onClick={onSettings} aria-label="메일 계정 설정" title="메일 계정 설정" className="p-1.5 rounded-lg text-text-muted hover:bg-bg shrink-0">
          <Settings size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 px-4 pb-4" role="group" aria-label="빠른 조건">
        {QUICK.map(({ key, label, icon }) => {
          const on = !!filter[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleFilter(key)}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-colors ${on ? "bg-primary/10 text-primary font-medium" : "text-text-muted hover:bg-bg"}`}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        <div className="flex rounded-xl bg-primary text-white text-sm font-semibold overflow-hidden">
          <button type="button" onClick={onCompose} className="flex-1 py-3 border-r border-white/30 hover:bg-primary-hover transition-colors">메일쓰기</button>
          <button type="button" onClick={onComposeSelf} className="flex-1 py-3 hover:bg-primary-hover transition-colors">내게쓰기</button>
        </div>
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onAddressBook}
          aria-current={bookActive ? "true" : undefined}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-left transition-colors ${bookActive ? "bg-primary/10 text-text font-semibold" : "text-text hover:bg-bg"}`}
        >
          <span className={bookActive ? "text-text" : "text-text-muted"}><BookUser size={17} /></span>
          주소록
        </button>
      </div>

      <nav aria-label="메일 폴더" className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {list.map((f) => (
          <button
            key={f.path}
            type="button"
            aria-current={f.path === folder && !bookActive ? "true" : undefined}
            onClick={() => onSelectFolder(f.path)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-left transition-colors ${f.path === folder && !bookActive ? "bg-primary/10 text-text font-semibold" : "text-text hover:bg-bg"}`}
          >
            <span className={f.path === folder ? "text-text" : "text-text-muted"}>{folderIcon(f)}</span>
            <span className="truncate flex-1">{folderLabel(f)}</span>
            {f.unread > 0 && f.path !== ALL_MAIL_FOLDER && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-badge-bg border border-badge-border text-badge-fg text-[10px] font-semibold flex items-center justify-center" aria-label={`안 읽은 메일 ${f.unread}개`}>
                {f.unread > 99 ? "99+" : f.unread}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
